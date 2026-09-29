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

  // 2. Parse if questionNumberInput already contains subQuestion (e.g. "Q3(b)", "3(b)", "Question 4(a)")
  const parsed = parseCanonicalQuestionIdentity(rawQ);
  if (parsed.subQuestion && !rawSub) {
    return parsed.canonicalId;
  }

  // Extract base question digits
  const qNum = parsed.questionNumber || rawQ.replace(/[^0-9]/g, '');
  if (!qNum) return 'Q1';

  // Determine sub-question
  let effectiveSub = rawSub || parsed.subQuestion;
  if (effectiveSub) {
    // Normalize format: strip outer brackets, trim, lowercase
    effectiveSub = effectiveSub
      .replace(/^[\(\[]|[\)\]]$/g, '')
      .trim()
      .toLowerCase();

    // Check nested: e.g. "a(1)" or "a1" -> "a(1)"
    const nested = effectiveSub.match(/^([a-z0-9]+)\(([a-z0-9]+)\)$/);
    if (nested) {
      effectiveSub = `${nested[1]}(${nested[2]})`;
    }
  }

  return effectiveSub ? `Q${qNum}(${effectiveSub})` : `Q${qNum}`;
}

/**
 * Parses any arbitrary question string into a complete CanonicalQuestionIdentity.
 */
export function parseCanonicalQuestionIdentity(rawCode: string): CanonicalQuestionIdentity {
  const trimmed = (rawCode || '').trim();

  // MCQ check
  if (/^(?:MCQ|OBJECTIVE)/i.test(trimmed) || /MCQ/i.test(trimmed)) {
    const num = trimmed.replace(/[^0-9]/g, '') || '1';
    return {
      canonicalId: `MCQ${num}`,
      questionNumber: num,
      subQuestion: 'MCQ',
      parentQuestionId: `MCQ${num}`,
      isMcq: true,
    };
  }

  // Standard or nested descriptive: "Question 5(a)", "Q5(a)", "5(a)", "5a", "Q6(a)(1)", "6(a)(2)"
  const qMatch = trimmed.match(/^(?:Question\s*|Q\.?\s*|Ans\.?\s*|Answer\s*)?(\d+)\s*(.*)$/i);
  if (qMatch) {
    const qNum = qMatch[1];
    const rest = (qMatch[2] || '').trim();
    let subQ: string | undefined;

    if (rest) {
      // Nested sub-question: (a)(1) or (a)(i)
      const nestedMatch = rest.match(/^\(([a-zA-Z0-9]+)\)\s*\(([a-zA-Z0-9]+)\)/);
      if (nestedMatch) {
        subQ = `${nestedMatch[1].toLowerCase()}(${nestedMatch[2].toLowerCase()})`;
      } else {
        // Single bracket: (a) or [a]
        const singleBracket = rest.match(/^[\(\[]([a-zA-Z0-9]+)[\)\]]/);
        if (singleBracket) {
          subQ = singleBracket[1].toLowerCase();
        } else {
          // Direct token: a or a1 or a(1)
          const directMatch = rest.match(/^([a-zA-Z](?:\([a-zA-Z0-9]+\)|[0-9]+)?)/);
          if (directMatch) {
            subQ = directMatch[1].toLowerCase();
          }
        }
      }
    }

    const canonicalId = subQ ? `Q${qNum}(${subQ})` : `Q${qNum}`;
    return {
      canonicalId,
      questionNumber: qNum,
      subQuestion: subQ,
      parentQuestionId: `Q${qNum}`,
      isMcq: false,
    };
  }

  const digits = trimmed.replace(/[^0-9]/g, '') || '1';
  return {
    canonicalId: `Q${digits}`,
    questionNumber: digits,
    subQuestion: undefined,
    parentQuestionId: `Q${digits}`,
    isMcq: false,
  };
}

/**
 * Generic deduplication engine for any list of questions in the evaluation pipeline.
 *
 * Rules strictly enforced:
 * 1. Canonical Key Normalization: Group by canonicalId.
 * 2. Parent / Child Rule: If ANY child sub-question (e.g. Q3(b), Q4(a), Q5(a), Q6(b)) exists,
 *    its parent question (e.g. Q3, Q4, Q5, Q6) is completely removed.
 * 3. Exactly-Once Rule: If multiple records exist for the same canonicalId, merges or picks the most
 *    authoritative instance (the one with highest evidence / component breakdown).
 * 4. Maximum Marks Authority: If paperStructureSubQuestions are supplied, overrides maxMarks to match
 *    the authoritative official paper scheme (e.g. Q3(b) = 4, Q4(b) = 4).
 */
export function deduplicateQuestionList<T extends {
  questionNumber?: string;
  subQuestion?: string;
  fullQuestionCode?: string;
  maximumMarks?: number;
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
    const rawCode = item.fullQuestionCode || (item.subQuestion ? `Q${item.questionNumber}(${item.subQuestion})` : `Q${item.questionNumber}`);
    const parsed = parseCanonicalQuestionIdentity(rawCode);
    const canonicalId = toCanonicalQuestionId(item.questionNumber || parsed.questionNumber, item.subQuestion || parsed.subQuestion);
    return {
      item,
      canonicalId,
      questionNumber: parsed.questionNumber,
      subQuestion: parsed.subQuestion,
      parentQuestionId: parsed.parentQuestionId,
      isMcq: parsed.isMcq,
    };
  });

  // 2. Identify parent questions that have child sub-questions
  // A questionNumber has children if any item has a defined subQuestion (and is not an MCQ)
  const questionNumbersWithChildren = new Set<string>();
  for (const m of mapped) {
    if (!m.isMcq && m.subQuestion) {
      questionNumbersWithChildren.add(m.questionNumber);
    }
  }

  // Also check paper structure for questions that are divided into sub-questions
  if (Array.isArray(paperStructureSubQuestions)) {
    for (const sq of paperStructureSubQuestions) {
      if (!sq.isMcq && sq.subQuestionNumber) {
        questionNumbersWithChildren.add(sq.questionNumber);
      }
    }
  }

  // 3. Filter out parent questions that have child sub-questions
  // If Q3(b) exists, drop generic 'Q3'
  const nonParentDuplicates = mapped.filter((m) => {
    if (m.isMcq) return true;
    if (!m.subQuestion && questionNumbersWithChildren.has(m.questionNumber)) {
      // This is a parent question container where child sub-questions exist!
      // Must not evaluate parent as a duplicate descriptive answer.
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

      // Prefer the entry with marking components, or higher marks awarded, or longer feedback
      const shouldReplace =
        newComps > existingComps ||
        (newComps === existingComps && (entry.item.marksAwarded || 0) > (existing.item.marksAwarded || 0)) ||
        (newComps === existingComps && (entry.item.detailedFeedback || '').length > (existing.item.detailedFeedback || '').length);

      if (shouldReplace) {
        canonicalMap.set(key, entry);
      }
    }
  }

  // 5. Authoritative Maximum Marks Alignment
  const authoritativeMaxMap = new Map<string, number>();
  if (Array.isArray(paperStructureSubQuestions)) {
    for (const sq of paperStructureSubQuestions) {
      const canon = toCanonicalQuestionId(sq.questionNumber, sq.subQuestionNumber);
      authoritativeMaxMap.set(canon, sq.maximumMarks);
    }
  }

  const result: T[] = [];
  for (const [canonicalId, entry] of canonicalMap.entries()) {
    const clonedItem: T = { ...entry.item };

    // Set canonical fields
    clonedItem.questionNumber = entry.questionNumber;
    clonedItem.subQuestion = entry.subQuestion;
    clonedItem.canonicalId = canonicalId;
    clonedItem.questionId = canonicalId;
    clonedItem.subQuestionId = entry.subQuestion;
    clonedItem.parentQuestionId = entry.parentQuestionId;
    clonedItem.fullQuestionCode = canonicalId;

    // Apply authoritative max marks if known
    if (authoritativeMaxMap.has(canonicalId)) {
      const authMax = authoritativeMaxMap.get(canonicalId)!;
      clonedItem.maximumMarks = authMax;
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
  questions: Array<{ questionNumber?: string; subQuestion?: string; canonicalId?: string; fullQuestionCode?: string }>
): {
  isValid: boolean;
  duplicateIds: string[];
  parentChildCollisions: string[];
  details: string;
} {
  const counts = new Map<string, number>();
  const questionNumbersWithChildren = new Set<string>();

  for (const q of questions) {
    const canonId = q.canonicalId || toCanonicalQuestionId(q.questionNumber, q.subQuestion);
    counts.set(canonId, (counts.get(canonId) || 0) + 1);

    const parsed = parseCanonicalQuestionIdentity(canonId);
    if (!parsed.isMcq && parsed.subQuestion) {
      questionNumbersWithChildren.add(parsed.questionNumber);
    }
  }

  const duplicateIds: string[] = [];
  for (const [id, count] of counts.entries()) {
    if (count > 1) {
      duplicateIds.push(id);
    }
  }

  const parentChildCollisions: string[] = [];
  for (const q of questions) {
    const canonId = q.canonicalId || toCanonicalQuestionId(q.questionNumber, q.subQuestion);
    const parsed = parseCanonicalQuestionIdentity(canonId);
    if (!parsed.isMcq && !parsed.subQuestion && questionNumbersWithChildren.has(parsed.questionNumber)) {
      parentChildCollisions.push(canonId);
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
