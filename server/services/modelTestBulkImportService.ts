/**
 * Deterministic TXT importer for CA Model Test Papers.
 *
 * Supported input:
 * - One TXT per model, with its model number in the filename or a MODEL TEST PAPER N header.
 * - One master TXT containing MODEL TEST PAPER N blocks.
 *
 * Every model must contain explicit QUESTION PAPER, SUGGESTED ANSWERS, and MARKING SCHEME
 * section headings. No AI extraction or inferred model numbering is used.
 */

import { DEFAULT_MODEL_TEST_MAX_NUMBER } from './modelTestLimits.js';

export interface ModelTestTextFile {
  fileName: string;
  content: string;
}

export interface ParsedModelTestMaterial {
  modelTestNumber: number;
  questionPaperText: string;
  suggestedAnswersText: string;
  markingSchemeText: string;
  sourceFileNames: string[];
  sourceFiles: {
    questionPaper?: string;
    suggestedAnswers?: string;
    markingScheme?: string;
  };
}

export interface ModelTestBulkParseResult {
  materials: ParsedModelTestMaterial[];
  errors: string[];
}

const MODEL_HEADER = /^\s*(?:={2,}\s*)?MODEL(?:\s+TEST)?(?:\s+PAPER)?\s*(?:NO\.?\s*|#\s*)?(10|0?[1-9])\s*(?:={2,})?\s*$/i;

const SECTION_HEADERS: Array<{ key: 'questionPaperText' | 'suggestedAnswersText' | 'markingSchemeText'; pattern: RegExp }> = [
  { key: 'questionPaperText', pattern: /^\s*(?:\[\s*)?(?:QUESTION\s+PAPER(?:\s+TEXT)?|QUESTIONS|QP)(?:\s*\])?\s*:?\s*$/i },
  { key: 'suggestedAnswersText', pattern: /^\s*(?:\[\s*)?(?:SUGGESTED\s+ANSWERS?|MODEL\s+ANSWERS?|MODEL\s+SOLUTIONS?|SUGGESTED\s+SOLUTIONS?)(?:\s*\])?\s*:?\s*$/i },
  { key: 'markingSchemeText', pattern: /^\s*(?:\[\s*)?(?:MARKING\s+SCHEME|STEP[- ]WISE\s+MARKING|MARKS?\s+DISTRIBUTION|MARKING\s+RUBRIC)(?:\s*\])?\s*:?\s*$/i },
];

function cleanText(value: string): string {
  return String(value || '')
    .replace(/^\uFEFF/, '')
    .replace(/\0/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000]/g, ' ')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function getModelNumberFromFileName(fileName: string): number | null {
  const match = String(fileName || '').match(/\bmodel(?:[ _-]*test)?(?:[ _-]*paper)?[ _-]*(?:no\.?[ _-]*|#)?(10|0?[1-9])\b/i)
    || String(fileName || '').match(/\bmtp[ _-]*(10|0?[1-9])\b/i);
  return match ? Number(match[1]) : null;
}


function getComponentRoleFromFileName(fileName: string): 'questionPaperText' | 'suggestedAnswersText' | 'markingSchemeText' | null {
  const name = String(fileName || '').replace(/\.[^.]+$/, '').toLowerCase();
  if (/\b(?:qp|question[ _-]*paper)\b/i.test(name)) return 'questionPaperText';
  if (/\b(?:sa|suggested[ _-]*answers?|model[ _-]*(?:answers?|solutions?))\b/i.test(name)) return 'suggestedAnswersText';
  if (/\b(?:ms|marking[ _-]*(?:scheme|rubric)|step[ _-]*wise[ _-]*marking)\b/i.test(name)) return 'markingSchemeText';
  return null;
}
function splitModelBlocks(file: ModelTestTextFile): Array<{ modelTestNumber: number | null; content: string; fileName: string }> {
  const normalized = cleanText(file.content);
  const lines = normalized.split('\n');
  const blocks: Array<{ modelTestNumber: number | null; content: string; fileName: string }> = [];
  let currentNumber: number | null = null;
  let currentLines: string[] = [];
  let foundHeader = false;

  const flush = () => {
    const block = cleanText(currentLines.join('\n'));
    if (block) blocks.push({ modelTestNumber: currentNumber, content: block, fileName: file.fileName });
  };

  for (const line of lines) {
    const match = line.match(MODEL_HEADER);
    if (match) {
      if (!foundHeader) {
        // Keep leading PDF source/conversion metadata with the first numbered
        // model block. These lines are not a separate, unnumbered model.
        foundHeader = true;
        currentNumber = Number(match[1]);
        continue;
      }

      flush();
      currentLines = [];
      currentNumber = Number(match[1]);
    } else {
      currentLines.push(line);
    }
  }
  flush();

  if (!foundHeader) {
    return [{
      modelTestNumber: getModelNumberFromFileName(file.fileName),
      content: normalized,
      fileName: file.fileName,
    }];
  }

  return blocks;
}

function parseModelSections(content: string): {
  questionPaperText: string;
  suggestedAnswersText: string;
  markingSchemeText: string;
  errors: string[];
} {
  const lines = cleanText(content).split('\n');
  const sections: Record<'questionPaperText' | 'suggestedAnswersText' | 'markingSchemeText', string[]> = {
    questionPaperText: [],
    suggestedAnswersText: [],
    markingSchemeText: [],
  };
  const seen = new Set<string>();
  let active: keyof typeof sections | null = null;
  const errors: string[] = [];

  for (const line of lines) {
    const header = SECTION_HEADERS.find((candidate) => candidate.pattern.test(line));
    if (header) {
      if (seen.has(header.key)) {
        errors.push(`Duplicate section heading: ${header.key}`);
      }
      seen.add(header.key);
      active = header.key;
      continue;
    }

    if (active) sections[active].push(line);
  }

  const questionPaperText = cleanText(sections.questionPaperText.join('\n'));
  const suggestedAnswersText = cleanText(sections.suggestedAnswersText.join('\n'));
  const markingSchemeText = cleanText(sections.markingSchemeText.join('\n'));

  if (!seen.has('questionPaperText')) errors.push('Missing QUESTION PAPER section.');
  if (!seen.has('suggestedAnswersText')) errors.push('Missing SUGGESTED ANSWERS section.');
  if (!seen.has('markingSchemeText')) errors.push('Missing MARKING SCHEME section.');
  if (questionPaperText.length < 30) errors.push('QUESTION PAPER section is empty or too short.');
  if (suggestedAnswersText.length < 30) errors.push('SUGGESTED ANSWERS section is empty or too short.');
  if (markingSchemeText.length < 10) errors.push('MARKING SCHEME section is empty or too short.');

  return { questionPaperText, suggestedAnswersText, markingSchemeText, errors };
}

/**
 * Parses and validates a complete course-specific Model 1–N batch before any database writes occur.
 * A model number must be explicit in the filename or in a MODEL TEST PAPER N block.
 */
export function parseModelTestBulkFiles(
  files: ModelTestTextFile[],
  options: { maxModelNumber?: number } = {},
): ModelTestBulkParseResult {
  const errors: string[] = [];
  const maxModelNumber = options.maxModelNumber ?? DEFAULT_MODEL_TEST_MAX_NUMBER;
  if (!Number.isInteger(maxModelNumber) || maxModelNumber < 1 || maxModelNumber > 10) {
    return { materials: [], errors: ['The configured Model Test limit must be an integer from 1 to 10.'] };
  }
  const totalBytes = files.reduce((sum, file) => sum + Buffer.byteLength(String(file?.content || ''), 'utf8'), 0);
  if (totalBytes > 32 * 1024 * 1024) {
    return { materials: [], errors: ['The complete TXT batch exceeds the 32 MB total limit.'] };
  }

  const materialsByNumber = new Map<number, {
    questionPaperText?: string;
    suggestedAnswersText?: string;
    markingSchemeText?: string;
    sourceFileNames: string[];
    sourceFiles: {
      questionPaper?: string;
      suggestedAnswers?: string;
      markingScheme?: string;
    };
  }>();

  if (!Array.isArray(files) || files.length === 0) {
    return { materials: [], errors: ['Select at least one TXT file.'] };
  }

  const addComponent = (modelNumber: number, key: 'questionPaperText' | 'suggestedAnswersText' | 'markingSchemeText', text: string, fileName: string) => {
    const current = materialsByNumber.get(modelNumber) || { sourceFileNames: [], sourceFiles: {} };
    if (current[key]) {
      errors.push(`Model ${modelNumber}: duplicate ${key} file supplied (${fileName}).`);
      return;
    }
    current[key] = cleanText(text);
    const sourceKey = key === 'questionPaperText'
      ? 'questionPaper'
      : key === 'suggestedAnswersText'
        ? 'suggestedAnswers'
        : 'markingScheme';
    current.sourceFiles[sourceKey] = fileName;
    if (!current.sourceFileNames.includes(fileName)) current.sourceFileNames.push(fileName);
    materialsByNumber.set(modelNumber, current);
  };

  for (const file of files) {
    const fileName = String(file?.fileName || 'unnamed.txt');
    const content = cleanText(file?.content || '');
    if (!content) {
      errors.push(`${fileName}: file is empty.`);
      continue;
    }
    if (!fileName.toLowerCase().endsWith('.txt')) {
      errors.push(`${fileName}: only .txt files are supported.`);
      continue;
    }
    if (content.length > 2_000_000) {
      errors.push(`${fileName}: file exceeds the 2 MB text limit.`);
      continue;
    }

    const fileRole = getComponentRoleFromFileName(fileName);
    const blocks = splitModelBlocks({ fileName, content });
    for (const block of blocks) {
      const modelNumber = block.modelTestNumber;
      if (!modelNumber || modelNumber < 1 || modelNumber > maxModelNumber) {
        errors.push(`${fileName}: Model Number must be clearly identified and within the allowed range 1–${maxModelNumber} in the filename or MODEL TEST PAPER heading.`);
        continue;
      }

      const lines = cleanText(block.content).split('\n');
      const presentHeaders = SECTION_HEADERS.filter((candidate) => lines.some((line) => candidate.pattern.test(line)));
      if (presentHeaders.length === 3) {
        const parsed = parseModelSections(block.content);
        if (parsed.errors.length > 0) {
          errors.push(`Model ${modelNumber} (${fileName}): ${parsed.errors.join(' ')}`);
          continue;
        }
        addComponent(modelNumber, 'questionPaperText', parsed.questionPaperText, fileName);
        addComponent(modelNumber, 'suggestedAnswersText', parsed.suggestedAnswersText, fileName);
        addComponent(modelNumber, 'markingSchemeText', parsed.markingSchemeText, fileName);
        continue;
      }

      if (presentHeaders.length === 1 && fileRole === presentHeaders[0].key) {
        const activeHeader = presentHeaders[0];
        const sectionLines: string[] = [];
        let active = false;
        for (const line of lines) {
          if (!active && activeHeader.pattern.test(line)) { active = true; continue; }
          if (active) sectionLines.push(line);
        }
        const sectionText = cleanText(sectionLines.join('\n'));
        const minLength = activeHeader.key === 'markingSchemeText' ? 10 : 30;
        if (sectionText.length < minLength) {
          errors.push(`Model ${modelNumber} (${fileName}): ${activeHeader.key} section is empty or too short.`);
          continue;
        }
        addComponent(modelNumber, activeHeader.key, sectionText, fileName);
        continue;
      }

      if (presentHeaders.length > 0 && !fileRole) {
        const parsed = parseModelSections(block.content);
        errors.push(`Model ${modelNumber} (${fileName}): ${parsed.errors.join(' ')}`);
        continue;
      }

      if (presentHeaders.length === 0 && fileRole) {
        const minLength = fileRole === 'markingSchemeText' ? 10 : 30;
        if (block.content.length < minLength) {
          errors.push(`Model ${modelNumber} (${fileName}): ${fileRole} file is empty or too short.`);
          continue;
        }
        addComponent(modelNumber, fileRole, block.content, fileName);
        continue;
      }

      errors.push(`Model ${modelNumber} (${fileName}): use all three section headings in one file, or identify this file as Question Paper, Suggested Answers, or Marking Scheme in its filename.`);
    }
  }

  const materials: ParsedModelTestMaterial[] = [];
  for (let modelNumber = 1; modelNumber <= maxModelNumber; modelNumber++) {
    const item = materialsByNumber.get(modelNumber);
    if (!item) {
      errors.push(`Model ${modelNumber}: missing from this batch.`);
      continue;
    }
    if (!item.questionPaperText || item.questionPaperText.length < 30) errors.push(`Model ${modelNumber}: missing or incomplete QUESTION PAPER file.`);
    if (!item.suggestedAnswersText || item.suggestedAnswersText.length < 30) errors.push(`Model ${modelNumber}: missing or incomplete SUGGESTED ANSWERS file.`);
    if (!item.markingSchemeText || item.markingSchemeText.length < 10) errors.push(`Model ${modelNumber}: missing or incomplete MARKING SCHEME file.`);
    if (item.questionPaperText && item.suggestedAnswersText && item.markingSchemeText) {
      materials.push({
        modelTestNumber: modelNumber,
        questionPaperText: item.questionPaperText,
        suggestedAnswersText: item.suggestedAnswersText,
        markingSchemeText: item.markingSchemeText,
        sourceFileNames: item.sourceFileNames,
        sourceFiles: item.sourceFiles,
      });
    }
  }

  return { materials, errors };
}
