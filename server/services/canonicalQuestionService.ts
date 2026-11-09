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
  subQuestion?: string;      // e.g. 'b', 'a(i)(1)'
  subQuestionPath?: string[]; // Every numbering level, e.g. ['a', 'ii', '1']
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
function findBalancedClosing(source: string, start: number, opening: '(' | '['): number {
  const closing = opening === '(' ? ')' : ']';
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === opening) depth += 1;
    else if (source[index] === closing) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

/**
 * Extract every level of a question's numbering path. The tokens are deliberately
 * opaque: letters, Arabic numerals, Roman numerals and future numbering systems
 * are identities, not punctuation that may be discarded.
 */
function parseQuestionPartPath(source: string, allowBareToken = false): string[] {
  let rest = String(source || '').trim();
  if (!rest) return [];

  const parts: string[] = [];
  let guard = 0;
  while (rest && guard++ < 12) {
    rest = rest.replace(/^\s+/, '').replace(/^[-_:/]+\s*/, '');
    if (!rest) break;

    // Named numbering levels may be chained, e.g. "Part IV Clause 2".
    // The explicit prefix makes the following bare token an unambiguous ID.
    const labelPrefix = rest.match(/^(?:PART|SUB[- ]?PART|SUBQUESTION|SUB[- ]?QUESTION|CLAUSE|SUB[- ]?CLAUSE|ITEM|PARAGRAPH|PARA)\s*/i);
    if (labelPrefix) {
      rest = rest.slice(labelPrefix[0].length).trim();
      allowBareToken = true;
      const namedToken = rest.match(/^([a-zA-Z0-9]+)(?=\s|\(|\[|$)/);
      if (namedToken) {
        parts.push(namedToken[1].toLowerCase());
        rest = rest.slice(namedToken[0].length);
        continue;
      }
    }

    if (allowBareToken) {
      const nestedDotted = rest.match(/^([a-zA-Z0-9]+(?:\.[a-zA-Z0-9]+)+)$/);
      if (nestedDotted) {
        parts.push(...nestedDotted[1].split('.').map((token) => token.toLowerCase()));
        break;
      }
    }

    if (rest[0] === '(' || rest[0] === '[') {
      const opening = rest[0] as '(' | '[';
      const closeAt = findBalancedClosing(rest, 0, opening);
      if (closeAt < 0) break;
      const inner = rest.slice(1, closeAt).trim();
      const nested = parseQuestionPartPath(inner, true);
      if (nested.length) parts.push(...nested);
      rest = rest.slice(closeAt + 1);
      continue;
    }

    // Dotted hierarchy: Q3.1.2 -> Q3(1)(2); Q3.b -> Q3(b).
    const dotted = rest.match(/^[.]\s*([a-zA-Z0-9]+)(?:\s*[.]\s*([a-zA-Z0-9]+))*/);
    const dottedHeadIsRoman = /^(?:i|ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii|xiii|xiv|xv|xvi|xvii|xviii|xix|xx|xxi|xxii|xxiii|xxiv|xxv|xxx|xl|l|lx|lxx|xc|c)$/i.test(dotted?.[1] || '');
    if (dotted && (/[0-9]/.test(dotted[1]) || /^[a-z]$/i.test(dotted[1]) || dottedHeadIsRoman)) {
      const tokenText = dotted[0].replace(/^\./, '');
      const tokens = tokenText.split('.').map((token) => token.trim()).filter(Boolean);
      parts.push(...tokens.map((token) => token.toLowerCase()));
      rest = rest.slice(dotted[0].length);
      continue;
    }

    // Preserve an unwrapped level followed by another nested level, e.g. a(i)(2).
    const directBeforeNested = rest.match(/^([a-zA-Z0-9]+)(?=\s*[([])/);
    if (directBeforeNested) {
      parts.push(directBeforeNested[1].toLowerCase());
      rest = rest.slice(directBeforeNested[0].length);
      continue;
    }

    // Explicit bare labels such as "a)", "iv.", "2)" are unambiguous.
    const punctuated = rest.match(/^([a-zA-Z0-9]+)\s*[.)](?=\s|$|[-–—:])/);
    if (punctuated) {
      parts.push(punctuated[1].toLowerCase());
      rest = rest.slice(punctuated[0].length);
      continue;
    }

    // A compact direct token is accepted only when it is a label or follows
    // an explicit Part/Clause prefix, never from arbitrary answer prose.
    const compact = rest.match(/^([a-zA-Z][a-zA-Z0-9]{0,3}|[0-9]{1,3})$/);
    if (compact && (allowBareToken || (/^[a-zA-Z](?:[0-9]+)?$/.test(compact[1]) && compact[1].length <= 3))) {
      parts.push(compact[1].toLowerCase());
      break;
    }

    // Unlabelled answer wording is not a numbering token. Stop rather than
    // guessing from the first word.
    break;
  }

  // Collapse only accidental repeated echoes such as Q3(b)(b). Roman numeral
  // and numeric levels are never collapsed merely because of their character set.
  return parts;
}

function buildCanonicalQuestionCode(questionNumber: string, parts: string[]): string {
  if (!parts.length) return 'Q' + questionNumber;
  // Preserve the established CA nested style (Q6(a(1))) while normalizing
  // equivalent repeated-group and dotted inputs into the same complete path.
  return 'Q' + questionNumber + '(' + parts[0] +
    parts.slice(1).map((part) => '(' + part + ')').join('') + ')';
}

/**
 * Normalizes questionNumber and subQuestion into a stable hierarchical ID.
 * Every explicitly numbered level is retained: Q3(a)(i), Q3(a)(ii),
 * Q3(a)(1), Q3(a)(2), Q3.1.2 and Q3(IV) remain distinct.
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

  let parts = [...(parsedQ.subQuestionPath || [])];
  if (rawSub && rawSub.toUpperCase() !== 'MCQ') {
    const parsedSub = parseCanonicalQuestionIdentity('Q' + parsedQ.questionNumber + '(' + rawSub + ')');
    const incoming = parsedSub.subQuestionPath || [];
    if (!parts.length) {
      parts = incoming;
    } else if (
      incoming.length >= parts.length &&
      parts.every((part, index) => incoming[index] === part)
    ) {
      // The sub-question field contains the full path as well as the Q code.
      parts = incoming;
    } else if (incoming.length <= parts.length &&
      incoming.every((part, index) => parts[parts.length - incoming.length + index] === part)) {
      // The sub-question field repeats the final leaf token already in the Q code.
    } else if (incoming.length <= parts.length &&
      incoming.every((part, index) => parts[index] === part)) {
      // The sub-question field repeats an ancestor path already in the Q code.
    } else {
      // A separate subQuestion field is the next level below the supplied Q code.
      parts = parts.concat(incoming);
    }
  }

  let finalCanonId = buildCanonicalQuestionCode(parsedQ.questionNumber, parts);

  // Align only on an exact normalized identity. Falling back to the first
  // question with the same leading letter can silently map Q1(a)(iii) to
  // Q1(a)(i), which is worse than leaving a genuinely unknown part unmapped.
  if (Array.isArray(paperStructureSubQuestions) && paperStructureSubQuestions.length > 0) {
    const exact = paperStructureSubQuestions.find((question) => {
      const sourceCode = question.fullQuestionCode || question.questionNumber;
      const normalized = parseCanonicalQuestionIdentity(sourceCode).canonicalId;
      return normalized.toLowerCase() === finalCanonId.toLowerCase();
    });
    if (exact) finalCanonId = parseCanonicalQuestionIdentity(exact.fullQuestionCode).canonicalId;
  }

  return finalCanonId;
}

/**
 * Parses any arbitrary question string into a complete CanonicalQuestionIdentity.
 * Handles alphabetic, Arabic, Roman-numeral, dotted and arbitrarily nested part
 * labels while retaining each level as a separate canonical path segment.
 */
export function parseCanonicalQuestionIdentity(rawCode: string): CanonicalQuestionIdentity {
  let trimmed = String(rawCode || '').trim();

  const isMcq = /^(?:MCQ|OBJECTIVE)/i.test(trimmed) || /MCQ/i.test(trimmed);
  if (isMcq) {
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
  const altRegex = /(?:[\(\[\{]\s*(?:OR|ALT|ALTERNATIVE|OPTION\s*[0-9]+|CHOICE\s*[0-9]+)\s*[\)\]\}]|\b(?:OR|ALT|ALTERNATIVE|OPTION\s*[0-9]+|CHOICE\s*[0-9]+)\b)/gi;
  if (altRegex.test(trimmed)) {
    isAlternative = true;
    trimmed = trimmed.replace(altRegex, ' ').trim();
  }

  const qMatch = trimmed.match(/^(?:Question\s*|Q\.?\s*|Ans\.?\s*|Answer\s*)?(\d+)\s*(.*)$/i);
  if (qMatch) {
    const qNum = qMatch[1];
    let rest = (qMatch[2] || '').trim();
    // Legacy answer-sheet labels sometimes append non-scoring markers such as
    // "_duplicate" or "(cont)". These are metadata, not another scoreable leaf.
    rest = rest.replace(/(?:[_-](?:duplicate|dup))$/i, '');
    let parsedParts = parseQuestionPartPath(rest);
    const romanNumberingTokens = new Set([
      'i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x',
      'xi', 'xii', 'xiii', 'xiv', 'xv', 'xvi', 'xvii', 'xviii', 'xix', 'xx',
      'xxi', 'xxii', 'xxiii', 'xxiv', 'xxv', 'xxx', 'xl', 'l', 'lx', 'lxx', 'xc', 'c',
    ]);
    parsedParts = parsedParts.filter((part, index) => {
      if (index === 0 || part.toLowerCase() !== parsedParts[index - 1].toLowerCase()) return true;
      const token = part.toLowerCase();
      // Repeated alphabetic labels can be OCR echoes (e.g. Q3(b(b))).
      // Numeric and Roman levels, however, may legitimately restart at each
      // nested level: Q3(1(1)) / Q3(iv(iv)) must retain both identities.
      return /^\\d+$/.test(token) || romanNumberingTokens.has(token);
    });
    if (parsedParts.length > 1 && /^(?:cont|contd|continued|continuation)$/i.test(parsedParts[parsedParts.length - 1])) {
      parsedParts = parsedParts.slice(0, -1);
    }
    const parts = parsedParts;
    const canonicalId = buildCanonicalQuestionCode(qNum, parts);
    const parentQuestionId = buildCanonicalQuestionCode(qNum, parts.slice(0, -1));
    const subQuestion = parts.length
      ? parts.map((part, index) => index === 0 ? part : '(' + part + ')').join('')
      : undefined;
    return {
      canonicalId,
      questionNumber: qNum,
      subQuestion,
      subQuestionPath: parts,
      parentQuestionId,
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
 * Parses any arbitrary question string into a complete CanonicalQuestionIdentity.
 * Handles:
 * - Alternatives: "Q3(b) (OR)", "Q3(b) OR", "Q3(b) Alternative", "Q4(b) [Option 2]" -> canonicalId: "Q3(b)", isAlternative: true
 * - Separators: "Q3_b", "3.b", "3-b", "Question 3 Part (b)", "Question 3 Part B", "3b" -> "Q3(b)"
 * - Nested / Roman clause: "Q3(b(iiiiv))", "3(b)(iii)", "3(b)(1)", "b(b)" -> canonicalId: "Q3(b)", subQuestion: "b"
 * - MCQs: "MCQ 1", "MCQ1", "Objective 1" -> "MCQ1"
 */
/**
 * Returns true only when childId is a strict descendant of parentId in the
 * canonical numbering tree. This is path-based, not string-prefix-based:
 * Q3(a(i)) is a child of Q3(a), even though its serialized form does not start
 * with the literal string "Q3(a)(".
 */
export function isCanonicalQuestionDescendant(childId: string, parentId: string): boolean {
  const child = parseCanonicalQuestionIdentity(String(childId || ''));
  const parent = parseCanonicalQuestionIdentity(String(parentId || ''));
  if (child.isMcq || parent.isMcq) return false;
  if (String(Number(child.questionNumber)) !== String(Number(parent.questionNumber))) return false;
  const childPath = child.subQuestionPath || [];
  const parentPath = parent.subQuestionPath || [];
  return childPath.length > parentPath.length &&
    parentPath.every((part, index) => part.toLowerCase() === childPath[index]?.toLowerCase());
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
      if (childId !== potentialParentId && isCanonicalQuestionDescendant(childId, potentialParentId)) {
        parentContainerIds.add(potentialParentId);
      }
    }
  }
  // Also collect main questions where children exist
  const addAllAncestors = (canonicalId: string) => {
    const current = parseCanonicalQuestionIdentity(canonicalId);
    let parent = current.parentQuestionId;
    const seenParents = new Set<string>();
    while (parent && parent !== current.canonicalId && !seenParents.has(parent)) {
      seenParents.add(parent);
      parentContainerIds.add(parent);
      const parsedParent = parseCanonicalQuestionIdentity(parent);
      if (parsedParent.parentQuestionId === parent) break;
      parent = parsedParent.parentQuestionId;
    }
  };
  for (const m of mapped) {
    if (!m.isMcq && m.subQuestion) addAllAncestors(m.canonicalId);
  }
  if (Array.isArray(paperStructureSubQuestions)) {
    for (const sq of paperStructureSubQuestions) {
      if (!sq.isMcq && sq.subQuestionNumber) {
        const code = parseCanonicalQuestionIdentity(sq.fullQuestionCode || sq.questionNumber).canonicalId;
        addAllAncestors(code);
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
      if (childId !== potentialParentId && isCanonicalQuestionDescendant(childId, potentialParentId)) {
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
