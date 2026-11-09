export interface FacultyMockReferenceSections {
  questionPaperText: string;
  suggestedAnswersText: string;
  markingSchemeText: string;
}

type FacultyMockReferenceSectionKey = keyof FacultyMockReferenceSections;

const SECTION_ALIASES: Record<FacultyMockReferenceSectionKey, Set<string>> = {
  questionPaperText: new Set([
    'QUESTION PAPER',
    'QUESTION PAPER TEXT',
  ]),
  suggestedAnswersText: new Set([
    'SUGGESTED ANSWER',
    'SUGGESTED ANSWERS',
    'SUGGESTED ANSWER TEXT',
    'SUGGESTED ANSWERS TEXT',
  ]),
  markingSchemeText: new Set([
    'MARKING SCHEME',
    'MARKING SCHEME TEXT',
  ]),
};

function normalizeSectionHeading(line: string): string {
  return line
    .trim()
    .replace(/^\uFEFF/, '')
    .replace(/^#{1,6}\s*/, '')
    .replace(/^[=\-_*]{2,}\s*/, '')
    .replace(/\s*[=\-_*]{2,}\s*$/, '')
    .replace(/^\d+[.)\-]\s*/, '')
    .replace(/^\[(.*)\]$/, '$1')
    .replace(/^SECTION\s*:\s*/i, '')
    .replace(/[:：]\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function identifySectionHeading(line: string): FacultyMockReferenceSectionKey | null {
  const heading = normalizeSectionHeading(line);
  for (const [key, aliases] of Object.entries(SECTION_ALIASES) as Array<[FacultyMockReferenceSectionKey, Set<string>]>) {
    if (aliases.has(heading)) return key;
  }
  return null;
}

/**
 * Validate each independently uploaded section without interpreting content
 * lines as structural headings. A section may legitimately contain repeated
 * phrases such as "Marking Scheme" within its own text.
 */
export function validateFacultyMockReferenceSections(
  sections: FacultyMockReferenceSections,
): FacultyMockReferenceSections {
  const result: FacultyMockReferenceSections = {
    questionPaperText: String(sections.questionPaperText || '').replace(/^\uFEFF/, '').trim(),
    suggestedAnswersText: String(sections.suggestedAnswersText || '').replace(/^\uFEFF/, '').trim(),
    markingSchemeText: String(sections.markingSchemeText || '').replace(/^\uFEFF/, '').trim(),
  };
  if (result.questionPaperText.length < 50) {
    throw new Error('The Question Paper Text TXT must contain at least 50 characters.');
  }
  if (result.suggestedAnswersText.length < 50) {
    throw new Error('The Suggested Answers TXT must contain at least 50 characters.');
  }
  if (result.markingSchemeText.length < 10) {
    throw new Error('The Marking Scheme TXT must contain at least 10 characters.');
  }
  return result;
}

/**
 * Serialize independently uploaded private TXT sections into the legacy
 * canonical reference format consumed by the existing parser and evaluator.
 * The browser uploads/stores each section separately; this serialization is
 * only an in-memory validation adapter and does not merge the stored files.
 */
export function buildFacultyMockEvaluationReference(sections: FacultyMockReferenceSections): string {
  return [
    '[QUESTION PAPER]',
    String(sections.questionPaperText || '').trim(),
    '[SUGGESTED ANSWERS]',
    String(sections.suggestedAnswersText || '').trim(),
    '[MARKING SCHEME]',
    String(sections.markingSchemeText || '').trim(),
  ].join('\n\n');
}

/**
 * Parse the canonical private Faculty Mock reference package into the three
 * components consumed by the existing CA evaluation pipeline. New admin uploads
 * are serialized in-memory from separate TXT files; legacy combined TXT files remain supported.
 * No AI or PDF extraction is used.
 * Required TXT format (headings may use Markdown, square brackets, or === fences):
 * [QUESTION PAPER]
 * ...
 * [SUGGESTED ANSWERS]
 * ...
 * [MARKING SCHEME]
 * ...
 */
export function parseFacultyMockEvaluationReference(rawText: string): FacultyMockReferenceSections {
  const normalized = String(rawText || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
  if (normalized.length < 100) {
    throw new Error('The evaluation TXT is too short. Include the Question Paper, Suggested Answers and Marking Scheme sections.');
  }

  const lines = normalized.split('\n');
  const markers: Array<{ key: FacultyMockReferenceSectionKey; line: number }> = [];
  for (let index = 0; index < lines.length; index += 1) {
    const key = identifySectionHeading(lines[index]);
    if (key) markers.push({ key, line: index });
  }

  const requiredKeys: FacultyMockReferenceSectionKey[] = [
    'questionPaperText',
    'suggestedAnswersText',
    'markingSchemeText',
  ];
  const seen = new Set<FacultyMockReferenceSectionKey>();
  for (const marker of markers) {
    if (seen.has(marker.key)) {
      const label = marker.key === 'questionPaperText' ? 'Question Paper'
        : marker.key === 'suggestedAnswersText' ? 'Suggested Answers'
        : 'Marking Scheme';
      throw new Error(`The TXT contains more than one ${label} section heading. Keep exactly one heading for each section.`);
    }
    seen.add(marker.key);
  }

  const missing = requiredKeys.filter((key) => !seen.has(key));
  if (missing.length) {
    const labels = missing.map((key) => key === 'questionPaperText' ? 'QUESTION PAPER'
      : key === 'suggestedAnswersText' ? 'SUGGESTED ANSWERS'
      : 'MARKING SCHEME');
    throw new Error(`Missing required TXT section(s): ${labels.join(', ')}. Use the three section headings shown in the admin upload instructions.`);
  }

  markers.sort((a, b) => a.line - b.line);
  const sections: Partial<FacultyMockReferenceSections> = {};
  for (let index = 0; index < markers.length; index += 1) {
    const marker = markers[index];
    const nextLine = markers[index + 1]?.line ?? lines.length;
    sections[marker.key] = lines.slice(marker.line + 1, nextLine).join('\n').trim();
  }

  const result = sections as FacultyMockReferenceSections;
  if (result.questionPaperText.length < 50) {
    throw new Error('The QUESTION PAPER section must contain at least 50 characters of question text.');
  }
  if (result.suggestedAnswersText.length < 50) {
    throw new Error('The SUGGESTED ANSWERS section must contain at least 50 characters of answer content.');
  }
  if (result.markingSchemeText.length < 10) {
    throw new Error('The MARKING SCHEME section must contain marking criteria or mark allocations (at least 10 characters).');
  }

  return result;
}
