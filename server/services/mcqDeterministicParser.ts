import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { db } from '../db.js';
import { PDFDocument } from 'pdf-lib';

const require = createRequire(import.meta.url);

let PDFParseClass: any = null;
try {
  const pdfParsePkg = require('pdf-parse');
  PDFParseClass = pdfParsePkg.PDFParse || pdfParsePkg;
} catch (e) {
  console.warn('[PDF Parser] pdf-parse module load note:', e);
}

export interface ExtractedQuestionDraft {
  id: string;
  tempId: string;
  course: string;
  subject: string;
  chapter: string;
  topic: string;
  questionType: 'normal' | 'case_based';
  caseId?: string;
  caseTitle?: string;
  caseScenario?: string;
  caseSequence?: number;
  difficulty: 'easy' | 'moderate' | 'hard';
  source: string;
  attempt?: string;
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctAnswer: 'A' | 'B' | 'C' | 'D' | '';
  explanation: string;
  reference: string;
  sourceMaterialName: string;
  sourceMaterialId?: string;
  sourcePage?: number;
  isDuplicate: boolean;
  duplicateExistingId?: string;
  duplicateExistingSource?: string;
  needsReview: boolean;
  reviewReason?: string;
  validationErrors: string[];
  explanationSource?: 'SOURCE' | 'AI_GENERATED_DRAFT' | 'MISSING';
  answerSource?: 'SOURCE' | 'AI_MAPPED' | 'MISSING';
  aiAssisted?: boolean;
}

export interface CaseGroupDraft {
  caseId: string;
  caseTitle: string;
  caseScenario: string;
  chapter: string;
  difficulty: 'easy' | 'moderate' | 'hard';
  questions: ExtractedQuestionDraft[];
}

export interface PdfExtractionDiagnosis {
  pageCount: number;
  pagesWithText: number;
  totalExtractedChars: number;
  totalExtractedLines: number;
  zeroTextPages: number[];
  lowTextPages: number[];
  candidateMarkersFound: number;
  isImageBasedOrScanned: boolean;
  status: 'SUCCESS' | 'IMAGE_BASED' | 'EMPTY' | 'PARSER_ISSUE';
  diagnosisMessage: string;
}

export interface MaterialProcessingResult {
  materialName: string;
  course: string;
  subject: string;
  sourceCategory: string;
  attempt?: string;
  totalDetected: number;
  normalCount: number;
  caseBasedCount: number;
  validCount: number;
  needsReviewCount: number;
  chapterAssignedCount: number;
  needsChapterReviewCount: number;
  duplicateCount: number;
  rejectedCount: number;
  chapterDistribution: Record<string, number>;
  questions: ExtractedQuestionDraft[];
  cases: CaseGroupDraft[];
  rawTextSnippet: string;
  pdfDiagnosis?: PdfExtractionDiagnosis;
  rejectionReasons?: string[];
  aiAssistedCount?: number;
  sourceExtractedCount?: number;
  aiExplanationDraftCount?: number;
  aiAuditNotes?: string[];
}

/**
 * Syllabus chapter mapping per course and subject.
 */
const CURRICULUM_CHAPTERS: Record<string, Record<string, string[]>> = {
  CA_FOUNDATION: {
    'Accounting': [
      'Theoretical Framework',
      'Accounting Process',
      'Bank Reconciliation Statement',
      'Inventories',
      'Depreciation and Amortisation',
      'Bills of Exchange and Promissory Notes',
      'Preparation of Final Accounts of Sole Proprietors',
      'Financial Statements of Not-for-Profit Organisations',
      'Accounts from Incomplete Records',
      'Partnership and LLP Accounts',
      'Company Accounts',
    ],
    'Business Laws': [
      'Indian Regulatory Framework',
      'The Indian Contract Act, 1872',
      'The Sale of Goods Act, 1930',
      'The Indian Partnership Act, 1932',
      'The Limited Liability Partnership Act, 2008',
      'The Companies Act, 2013',
      'Negotiable Instruments Act, 1881',
    ],
    'Quantitative Aptitude': [
      'Ratio and Proportion, Indices, Logarithms',
      'Equations',
      'Linear Inequalities',
      'Mathematics of Finance',
      'Permutations and Combinations',
      'Sequence and Series',
      'Sets, Relations and Functions',
      'Statistical Representation of Data',
      'Measures of Central Tendency and Dispersion',
      'Probability',
      'Theoretical Distributions',
      'Correlation and Regression',
      'Index Numbers',
    ],
    'Business Economics': [
      'Introduction to Business Economics',
      'Theory of Demand and Supply',
      'Theory of Production and Cost',
      'Price Determination in Different Markets',
      'Determination of National Income',
      'Business Cycles',
      'Public Finance',
      'Money Market',
      'International Trade',
      'Indian Economy',
    ],
  },
  CA_INTERMEDIATE: {
    'Advanced Accounting': [
      'Introduction to Accounting Standards',
      'Framework for Financial Reporting',
      'Applicability of Accounting Standards',
      'Presentation & Disclosures (AS 1, AS 3, AS 17, AS 18, AS 20, AS 24, AS 25)',
      'Measurement Based AS (AS 2, AS 10, AS 13, AS 16, AS 26, AS 28)',
      'Revenue & Transactions (AS 7, AS 9, AS 11, AS 12, AS 14, AS 19, AS 22)',
      'Consolidated Financial Statements (AS 21, AS 23, AS 27)',
      'Financial Statements of Companies',
      'Buyback of Securities',
      'Amalgamation of Companies',
      'Internal Reconstruction',
      'Branch Accounting',
    ],
    'Corporate and Other Laws': [
      'Preliminary',
      'Incorporation of Company and Matters Incidental Thereto',
      'Prospectus and Allotment of Securities',
      'Share Capital and Debentures',
      'Acceptance of Deposits by Companies',
      'Registration of Charges',
      'Management and Administration',
      'Declaration and Payment of Dividend',
      'Accounts of Companies',
      'Audit and Auditors',
      'Companies Incorporated Outside India',
      'The Limited Liability Partnership Act, 2008',
      'The General Clauses Act, 1897',
      'Interpretation of Statutes',
      'The Foreign Exchange Management Act, 1999',
    ],
    'Taxation': [
      'Basic Concepts',
      'Residence and Scope of Total Income',
      'Incomes which do not form part of Total Income',
      'Salaries',
      'Income from House Property',
      'Profits and Gains of Business or Profession',
      'Capital Gains',
      'Income from Other Sources',
      'Income of Other Persons included in Assessee Total Income',
      'Aggregation of Income, Set-off and Carry Forward of Losses',
      'Deductions from Gross Total Income',
      'Computation of Total Income and Tax Payable',
      'Advance Tax, TDS and TCS',
      'Provisions for Filing Return of Income',
      'GST in India - An Introduction',
      'Supply under GST',
      'Charge of GST',
      'Place of Supply',
      'Exemptions from GST',
      'Time of Supply',
      'Value of Supply',
      'Input Tax Credit',
      'Registration',
      'Tax Invoice, Credit and Debit Notes',
      'Accounts and Records',
      'E-Way Bill',
      'Payment of Tax',
      'Returns',
    ],
    'Cost and Management Accounting': [
      'Introduction to Cost and Management Accounting',
      'Material Cost',
      'Employee Cost and Direct Expenses',
      'Overheads: Absorption Costing Method',
      'Activity Based Costing (ABC)',
      'Cost Sheet',
      'Cost Accounting System',
      'Unit & Batch Costing',
      'Job Costing and Contract Costing',
      'Process & Operation Costing',
      'Joint Products and By Products',
      'Service Costing',
      'Standard Costing',
      'Marginal Costing',
      'Budget and Budgetary Control',
    ],
    'Auditing and Ethics': [
      'Nature, Objective and Scope of Audit',
      'Audit Strategy, Audit Planning and Audit Programme',
      'Risk Assessment and Internal Control',
      'Audit Evidence',
      'Audit of Items of Financial Statements',
      'Audit Documentation',
      'Completion and Review',
      'Audit Report',
      'Special Features of Audit of Different Types of Entities',
      'Audit of Banks',
      'Ethics and Terms of Audit Engagements',
    ],
    'Financial Management and Strategic Management': [
      'Scope and Objectives of Financial Management',
      'Types of Financing',
      'Financial Analysis and Planning - Ratio Analysis',
      'Cost of Capital',
      'Financing Decisions - Capital Structure',
      'Financing Decisions - Leverages',
      'Investment Decisions',
      'Dividend Decisions',
      'Management of Working Capital',
      'Introduction to Strategic Management',
      'Strategic Analysis: External Environment',
      'Strategic Analysis: Internal Environment',
      'Strategic Choices',
      'Strategy Implementation and Evaluation',
    ],
  },
  CA_FINAL: {
    'Financial Reporting': [
      'Introduction to Indian Accounting Standards (Ind AS)',
      'Conceptual Framework for Financial Reporting',
      'Ind AS on Presentation and Disclosures',
      'Ind AS on Measurement (Ind AS 2, 16, 38, 40, 41, 105, 36, 19, 37)',
      'Ind AS 115 Revenue from Contracts with Customers',
      'Ind AS 116 Leases',
      'Ind AS on Financial Instruments (Ind AS 32, 109, 107)',
      'Consolidated Financial Statements & Business Combinations (Ind AS 103, 110, 111, 28)',
      'Accounting and Reporting of Financial Instruments for Financial Institutions',
      'Analysis of Financial Statements',
      'Integrated Reporting',
    ],
    'Advanced Financial Management': [
      'Financial Policy and Corporate Strategy',
      'Risk Management',
      'Advanced Capital Budgeting Decisions',
      'Security Analysis',
      'Security Valuation',
      'Portfolio Management',
      'Securitization',
      'Mutual Funds',
      'Derivatives Analysis and Valuation',
      'Foreign Exchange Exposure and Risk Management',
      'International Financial Management',
      'Interest Rate Risk Management',
      'Business Valuation',
      'Mergers, Acquisitions and Corporate Restructuring',
      'Startup Finance',
    ],
    'Advanced Auditing, Assurance and Professional Ethics': [
      'Quality Control (SQC 1, SA 220)',
      'General Auditing Principles and Auditors Responsibilities (SA 240, 250, 260, 299, 402)',
      'Audit Planning, Strategy and Execution (SA 300, 315, 320, 330, 450)',
      'Materiality, Risk Assessment and Internal Control',
      'Audit Evidence (SA 500, 501, 505, 510, 520, 530, 540, 550, 560, 570, 580)',
      'Completion and Review (SA 700, 701, 705, 706, 710, 720)',
      'Specialised Areas and Auditing of Banks/NBFCs',
      'Audit of Public Sector Undertakings',
      'Internal Audit, Due Diligence and Forensic Audit',
      'Sustainable Development Goals (SDG) and ESG Assurance',
      'Professional Ethics and Code of Conduct',
    ],
    'Direct Tax Laws and International Taxation': [
      'Basic Concepts & Rates of Tax',
      'Incomes which do not form part of Total Income',
      'Profits and Gains of Business or Profession',
      'Capital Gains',
      'Income from Other Sources',
      'Income of Other Persons included in Assessee Total Income',
      'Deductions from Gross Total Income',
      'Assessment of Various Entities (Companies, LLPs, Trusts)',
      'Tax Planning, Tax Avoidance & Tax Evasion',
      'Deduction, Collection and Recovery of Tax',
      'Appeals and Revision',
      'Penalties and Offences',
      'Transfer Pricing and Other Anti-Avoidance Measures',
      'Non-Resident Taxation',
      'Double Taxation Relief (DTAA)',
      'Equalisation Levy & BEPS',
    ],
    'Indirect Tax Laws': [
      'Supply under GST',
      'Charge of GST',
      'Place of Supply',
      'Exemptions from GST',
      'Time and Value of Supply',
      'Input Tax Credit',
      'Registration',
      'Tax Invoice, Credit and Debit Notes',
      'Accounts and Records, E-Way Bill',
      'Payment of Tax',
      'Refunds',
      'Assessment and Audit',
      'Inspection, Search, Seizure and Arrest',
      'Demands and Recovery',
      'Liability to Pay in Certain Cases',
      'Offences and Penalties',
      'Appeals and Revision',
      'Customs: Levy of and Exemptions from Customs Duty',
      'Types of Duty',
      'Classification of Imported and Export Goods',
      'Valuation under Customs Act, 1962',
      'Importation, Exportation and Transportation of Goods',
      'Foreign Trade Policy',
    ],
  },
};

export function getCurriculumChapters(course: string, subject: string): string[] {
  const normCourse = course.toUpperCase();
  const courseObj = CURRICULUM_CHAPTERS[normCourse];
  if (!courseObj) return [];
  for (const [subName, chapters] of Object.entries(courseObj)) {
    if (subName.toLowerCase().trim() === subject.toLowerCase().trim()) {
      return chapters;
    }
  }
  return [];
}

/**
 * 100% Deterministic, local PDF text extraction without AI or external APIs.
 * Preserves page boundaries, provides accurate diagnosis metrics, and handles
 * multi-page layouts cleanly.
 */
export async function extractTextFromPdfBufferDeterministic(
  buffer: Buffer,
  originalFilename?: string
): Promise<{
  text: string;
  pageCount: number;
  diagnosis: PdfExtractionDiagnosis;
  pageTexts: { pageNum: number; text: string }[];
}> {
  if (!buffer || buffer.length === 0) {
    const emptyDiagnosis: PdfExtractionDiagnosis = {
      pageCount: 0,
      pagesWithText: 0,
      totalExtractedChars: 0,
      totalExtractedLines: 0,
      zeroTextPages: [],
      lowTextPages: [],
      candidateMarkersFound: 0,
      isImageBasedOrScanned: true,
      status: 'EMPTY',
      diagnosisMessage: 'Uploaded PDF file buffer is empty (0 bytes).',
    };
    return { text: '', pageCount: 0, diagnosis: emptyDiagnosis, pageTexts: [] };
  }

  // 1. Determine ground truth page count via pdf-lib structure
  let totalPages = 1;
  try {
    const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    totalPages = Math.max(1, pdfDoc.getPageCount());
  } catch {
    const rawBufStr = buffer.toString('binary');
    const pageMatches = rawBufStr.match(/\/Type\s*\/Page\b/g);
    if (pageMatches) totalPages = Math.max(1, pageMatches.length);
  }

  const pageTexts: { pageNum: number; text: string }[] = [];
  let pdfParseSucceeded = false;

  // 2. Primary local deterministic extractor using pdf-parse (pdf.js core)
  if (PDFParseClass) {
    try {
      const uint8 = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
      let parserInstance: any = null;
      let textResult: any = null;

      if (typeof PDFParseClass === 'function') {
        const originalWarn = console.warn;
        try {
          console.warn = (...args: any[]) => {
            if (typeof args[0] === 'string' && (args[0].includes('standardFontDataUrl') || args[0].includes('UnknownErrorException'))) {
              return; // Suppress internal pdf.js node font data url warning
            }
            originalWarn(...args);
          };
          try {
            parserInstance = new PDFParseClass(uint8);
            if (parserInstance && typeof parserInstance.getText === 'function') {
              textResult = await parserInstance.getText();
              if (parserInstance.destroy) await parserInstance.destroy();
            }
          } catch {
            // If not a constructor, try invoking directly
            textResult = await PDFParseClass(buffer);
          }
        } finally {
          console.warn = originalWarn;
        }
      }

      if (textResult) {
        if (Array.isArray(textResult.pages) && textResult.pages.length > 0) {
          totalPages = Math.max(totalPages, textResult.pages.length);
          for (let i = 0; i < textResult.pages.length; i++) {
            const p = textResult.pages[i];
            const pNum = typeof p.num === 'number' ? p.num : i + 1;
            const pText = typeof p.text === 'string' ? p.text : '';
            pageTexts.push({ pageNum: pNum, text: pText });
          }
          pdfParseSucceeded = true;
        } else if (typeof textResult.text === 'string' && textResult.text.length > 0) {
          pageTexts.push({ pageNum: 1, text: textResult.text });
          pdfParseSucceeded = true;
        }
      }
    } catch (parseErr: any) {
      console.warn('[PDF Parser] Primary pdf-parse parse attempt note:', parseErr?.message || parseErr);
    }
  }

  // 3. Robust secondary fallback if primary parser returned no text
  if (!pdfParseSucceeded || pageTexts.length === 0) {
    const fallbackChunks: string[] = [];
    const bufStr = buffer.toString('latin1');

    // Literal text operators
    const tjRegex = /\(([^)]+)\)\s*(?:Tj|'|")/g;
    let match: RegExpExecArray | null;
    while ((match = tjRegex.exec(bufStr)) !== null) {
      if (match[1] && match[1].length > 1) fallbackChunks.push(match[1]);
    }

    // Array text operators
    const arrayTjRegex = /\[(.*?)\]\s*TJ/g;
    while ((match = arrayTjRegex.exec(bufStr)) !== null) {
      const parts = match[1].match(/\(([^)]*)\)/g);
      if (parts) {
        const combined = parts.map((p) => p.slice(1, -1)).join('');
        if (combined.length > 1) fallbackChunks.push(combined);
      }
    }

    // Flate streams
    const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let sCount = 0;
    while ((match = streamRegex.exec(bufStr)) !== null && sCount < 100) {
      sCount++;
      try {
        const streamBytes = Buffer.from(match[1], 'latin1');
        const dec = zlib.inflateSync(streamBytes);
        const decStr = dec.toString('utf8');

        let decMatch: RegExpExecArray | null;
        while ((decMatch = tjRegex.exec(decStr)) !== null) {
          if (decMatch[1] && decMatch[1].length > 1) fallbackChunks.push(decMatch[1]);
        }
        while ((decMatch = arrayTjRegex.exec(decStr)) !== null) {
          const parts = decMatch[1].match(/\(([^)]*)\)/g);
          if (parts) {
            const combined = parts.map((p) => p.slice(1, -1)).join('');
            if (combined.length > 1) fallbackChunks.push(combined);
          }
        }
      } catch {
        // Non-zlib stream; continue
      }
    }

    const joinedFallback = fallbackChunks.join('\n');
    pageTexts.push({ pageNum: 1, text: joinedFallback });
  }

  // 4. Calculate Diagnostic Metrics
  let pagesWithText = 0;
  let totalExtractedChars = 0;
  let totalExtractedLines = 0;
  const zeroTextPages: number[] = [];
  const lowTextPages: number[] = [];

  for (const pt of pageTexts) {
    const trimmed = pt.text.trim();
    const chars = trimmed.length;
    const lines = trimmed ? trimmed.split(/\r?\n/).filter((l) => l.trim().length > 0).length : 0;

    totalExtractedChars += chars;
    totalExtractedLines += lines;

    if (chars === 0) {
      zeroTextPages.push(pt.pageNum);
    } else if (chars < 30) {
      lowTextPages.push(pt.pageNum);
    } else {
      pagesWithText++;
    }
  }

  // Construct continuous text stream with exact page boundary preservation
  const streamParts: string[] = [];
  for (const pt of pageTexts) {
    if (pt.text.trim().length > 0) {
      streamParts.push(`\n\n--- Page ${pt.pageNum} ---\n` + pt.text.trim());
    }
  }
  const continuousText = streamParts.join('\n\n');

  // Candidate question markers regex across the extracted text
  const markerRegex = /(?:^|\n)\s*(?:(?:Question|Q\.?)\s*(?:No\.?\s*)?\d{1,4}[\s.:\)-]+|(?:\d{1,4}[\.\)]\s+))/gi;
  const markerMatches = continuousText.match(markerRegex) || [];
  const candidateMarkersFound = markerMatches.length;

  const isImageBasedOrScanned = totalPages > 0 && totalExtractedChars < 25;

  let status: PdfExtractionDiagnosis['status'] = 'SUCCESS';
  let diagnosisMessage = '';

  if (isImageBasedOrScanned) {
    status = 'IMAGE_BASED';
    diagnosisMessage =
      'This PDF appears to be image-based or contains no extractable text. Automatic rule-based MCQ extraction is not available for this document.';
  } else if (totalExtractedChars === 0) {
    status = 'EMPTY';
    diagnosisMessage = 'PDF extraction produced 0 readable characters across all pages.';
  } else if (candidateMarkersFound === 0) {
    status = 'PARSER_ISSUE';
    diagnosisMessage = `Extracted ${totalExtractedChars} characters and ${totalExtractedLines} lines across ${totalPages} pages, but no candidate question markers (e.g. Q1., 1.) were detected.`;
  } else {
    status = 'SUCCESS';
    diagnosisMessage = `Text-based PDF successfully extracted: ${totalExtractedChars} characters, ${totalExtractedLines} lines, and ${candidateMarkersFound} candidate question markers across ${totalPages} pages.`;
  }

  const diagnosis: PdfExtractionDiagnosis = {
    pageCount: totalPages,
    pagesWithText,
    totalExtractedChars,
    totalExtractedLines,
    zeroTextPages,
    lowTextPages,
    candidateMarkersFound,
    isImageBasedOrScanned,
    status,
    diagnosisMessage,
  };

  // Safe diagnosis logging (Counts and metrics only; NEVER log raw document text)
  console.log(
    `[PDF Extraction Diagnosis] File: "${originalFilename || 'document.pdf'}" | ` +
      `Pages: ${totalPages} | Pages with text: ${pagesWithText} | ` +
      `Chars: ${totalExtractedChars} | Lines: ${totalExtractedLines} | ` +
      `Zero-text pages: [${zeroTextPages.join(', ')}] | Low-text pages: [${lowTextPages.join(', ')}] | ` +
      `Question markers detected: ${candidateMarkersFound} | Layer Status: ${status}`
  );

  return {
    text: continuousText,
    pageCount: totalPages,
    diagnosis,
    pageTexts,
  };
}

/**
 * Normalizes common source formatting differences harmlessly:
 * CRLF/LF, non-breaking spaces, smart quotes, dashes, bullets, and circled letters.
 */
export function normalizeMaterialRawText(rawText: string): string {
  if (!rawText) return '';

  let text = rawText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\u00A0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u2022\u2023\u25E6\u2043\u2219]/g, '-')
    // Circled letters normalization
    .replace(/\u24B6/g, '(A)')
    .replace(/\u24B7/g, '(B)')
    .replace(/\u24B8/g, '(C)')
    .replace(/\u24B9/g, '(D)')
    .replace(/\u24D0/g, '(a)')
    .replace(/\u24D1/g, '(b)')
    .replace(/\u24D2/g, '(c)')
    .replace(/\u24D3/g, '(d)')
    .replace(/\n{4,}/g, '\n\n\n');

  return text;
}

/**
 * Deterministically checks if a line or heading represents a syllabus chapter.
 * Accurately recognizes chapter headings while strictly rejecting question lines, options, or prose.
 */
export function matchChapterHeading(line: string, availableChapters: string[]): string | null {
  if (!line || !availableChapters || availableChapters.length === 0) return null;

  const clean = line.replace(/[*_#\-]+/g, ' ').replace(/\s+/g, ' ').trim();
  const lower = clean.toLowerCase();

  // If line is a question line, option line, or prose question, it is NEVER a chapter heading
  if (/^(?:Question|Q\.?)\s*(?:No\.?\s*)?\d+/i.test(clean)) return null;
  if (/^\(?\d{1,4}\)?[\.\)]\s+/i.test(clean)) return null;
  if (/^(?:\([a-dA-D]\)|[a-dA-D][\.\):])\s+/i.test(clean)) return null;
  if (clean.includes('?') || clean.length > 90) return null;
  if (/^(?:Answer|Ans|Explanation|Solution|Reason|Reference|Difficulty|Key)[:\s\-]/i.test(clean)) return null;

  // 1. Explicit chapter label prefix: "CHAPTER: Theory of Demand and Supply" or "CHAPTER - 1: ..."
  const prefixMatch = clean.match(/^(?:CHAPTER|Unit|Module|Section)\s*(?:[-:]|\s+)?(?:\d{1,2})?[\s.:\)-]*(.+)$/i);
  if (prefixMatch) {
    const cand = prefixMatch[1].trim().toLowerCase();
    for (const ch of availableChapters) {
      if (cand.includes(ch.toLowerCase()) || ch.toLowerCase().includes(cand)) {
        return ch;
      }
    }
  }

  // 2. Direct Chapter Numbering without title: "Chapter 1", "Chapter 2", "Unit 3"
  const numOnlyMatch = clean.match(/^(?:Chapter|Ch\.?|Unit|Module)\s*[-:]?\s*(\d{1,2})\s*$/i);
  if (numOnlyMatch) {
    const idx = parseInt(numOnlyMatch[1], 10) - 1;
    if (idx >= 0 && idx < availableChapters.length) {
      return availableChapters[idx];
    }
  }

  // 3. Standalone line matching exact curriculum chapter name
  for (const ch of availableChapters) {
    const chLower = ch.toLowerCase();
    if (lower === chLower) {
      return ch;
    }
    // "1. Theory of Demand and Supply" or "Chapter 1 - Theory of Demand and Supply"
    const strippedNumber = lower.replace(/^(?:chapter|unit|ch\.?)?\s*\d+[\s.:\)-]+/, '').trim();
    if (strippedNumber === chLower) {
      return ch;
    }
  }

  return null;
}

/**
 * Duplicate check against mcq_questions database.
 */
function checkDuplicateQuestion(questionText: string): { isDuplicate: boolean; existingId?: string; existingSource?: string } {
  if (!questionText || questionText.trim().length < 20) {
    return { isDuplicate: false };
  }

  const cleanText = questionText.toLowerCase().replace(/\s+/g, ' ').trim();
  try {
    const row = db
      .prepare(
        `SELECT id, source, question_text FROM mcq_questions
         WHERE LOWER(REPLACE(question_text, ' ', '')) = LOWER(REPLACE(?, ' ', ''))
           AND status != 'deleted'
           AND id NOT IN (SELECT entity_id FROM tombstones WHERE collection_name = 'mcq_questions')
         LIMIT 1`
      )
      .get(cleanText) as any;

    if (row) {
      return {
        isDuplicate: true,
        existingId: row.id,
        existingSource: row.source,
      };
    }
  } catch (err) {
    console.warn('[Duplicate Check] Warning:', err);
  }

  return { isDuplicate: false };
}

/**
 * 100% CANONICAL DETERMINISTIC MCQ PARSER.
 * ZERO AI. ZERO EXTERNAL APIS.
 *
 * Implements:
 * 1. Stream-order processing with Chapter Inheritance.
 * 2. Multi-line question & multi-line option support.
 * 3. Cross-page question support without truncation.
 * 4. Case Study scenario grouping and child question sequencing.
 * 5. Strict accounting of every single candidate (No question loss).
 */
export function parseMaterialTextDeterministic(params: {
  rawText: string;
  course: string;
  subject: string;
  sourceCategory: string;
  attempt?: string;
  materialName: string;
  sourceMaterialId?: string;
  pdfDiagnosis?: PdfExtractionDiagnosis;
}): MaterialProcessingResult {
  const { rawText, course, subject, sourceCategory, attempt, materialName, sourceMaterialId, pdfDiagnosis } = params;

  const normalized = normalizeMaterialRawText(rawText);
  const availableChapters = getCurriculumChapters(course, subject);

  const questions: ExtractedQuestionDraft[] = [];
  const casesMap = new Map<string, CaseGroupDraft>();
  const chapterDistribution: Record<string, number> = {};
  const processedQuestionTexts = new Set<string>();
  const rejectedReasons: string[] = [];

  let candidateCount = 0;
  let rejectedCount = 0;

  // Track active page and active chapter through the sequential document stream
  let activePage = 1;
  let activeChapter: string | null = null;

  // -------------------------------------------------------------------------
  // PHASE 1: IDENTIFY STRUCTURAL ANCHORS IN SEQUENTIAL STREAM ORDER
  // -------------------------------------------------------------------------
  interface StreamAnchor {
    pos: number;
    type: 'PAGE' | 'CHAPTER' | 'CASE' | 'QUESTION';
    pageNum?: number;
    chapterName?: string;
    caseId?: string;
    caseTitle?: string;
    caseScenario?: string;
    qNum?: number;
    rawMarker?: string;
  }

  const anchors: StreamAnchor[] = [];

  // A. Page anchors: --- Page N ---
  const pageRegex = /(?:^|\n)\s*---\s*Page\s*(\d+)\s*---\s*(?:\n|$)/gi;
  let pMatch: RegExpExecArray | null;
  while ((pMatch = pageRegex.exec(normalized)) !== null) {
    anchors.push({
      pos: pMatch.index,
      type: 'PAGE',
      pageNum: parseInt(pMatch[1], 10),
    });
  }

  // B. Chapter Heading anchors
  const lines = normalized.split('\n');
  let charOffset = 0;
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine.length >= 3 && trimmedLine.length <= 120) {
      const matchedCh = matchChapterHeading(trimmedLine, availableChapters);
      if (matchedCh) {
        anchors.push({
          pos: charOffset,
          type: 'CHAPTER',
          chapterName: matchedCh,
        });
      }
    }
    charOffset += line.length + 1; // +1 for the newline
  }

  // C. Case Study / Case Scenario anchors
  const caseHeaderRegex = /(?:^|\n)\s*(?:Case\s+(?:Scenario|Study|\d+)[:\s\-]*|Integrated\s+Case\s+Scenario\s*\d*[:\s\-]*)/gi;
  let cMatch: RegExpExecArray | null;
  let caseAutoIndex = 0;
  while ((cMatch = caseHeaderRegex.exec(normalized)) !== null) {
    caseAutoIndex++;
    const caseId = `CASE-${String(caseAutoIndex).padStart(3, '0')}`;
    const caseTitle = `${materialName} - Case ${caseAutoIndex}`;
    anchors.push({
      pos: cMatch.index,
      type: 'CASE',
      caseId,
      caseTitle,
    });
  }

  // D. Question Marker anchors
  // Recognized formats: Q1., Q1), Q.1, Q. 1, Question 1., Question No. 1, 1., 1), 01., 01), (1), [1]
  const questionMarkerRegex = /(?:^|\n)\s*(?:(?:Question|Q\.?)\s*(?:No\.?\s*)?(\d{1,4})[\s.:\)-]+|(\d{1,4})[\.\)]\s+|(?:\((\d{1,4})\)|\[(\d{1,4})\])\s+)(?=[^\n]*\S)/gi;
  let qMatch: RegExpExecArray | null;

  while ((qMatch = questionMarkerRegex.exec(normalized)) !== null) {
    candidateCount++;
    const pos = qMatch.index;
    const qNum = parseInt(qMatch[1] || qMatch[2] || qMatch[3] || '0', 10);
    const rawMarker = qMatch[0].trim();

    // Contextual validation: inspect lookahead window to verify it contains options
    const peek = normalized.slice(pos, pos + 2500);

    const hasOptionA = /(?:^|\s)(?:\(([aA])\)\.?|\[([aA])\]\.?|([aA])[\.\):])\s+/i.test(peek);
    const hasOptionB = /(?:^|\s)(?:\(([bB])\)\.?|\[([bB])\]\.?|([bB])[\.\):])\s+/i.test(peek);
    const hasExplicitAnswer = /(?:Answer|Ans)[:\s\-]*\(?([a-dA-D])\)?/i.test(peek);

    if ((hasOptionA && hasOptionB) || hasExplicitAnswer) {
      anchors.push({
        pos,
        type: 'QUESTION',
        qNum,
        rawMarker,
      });
    } else {
      // Discard false positives like section numbers (e.g., Section 2(46), 2026. In the year 2026...)
      rejectedCount++;
      rejectedReasons.push(`Marker "${rawMarker}" at char ${pos} rejected: Insufficient MCQ option structure (missing Options A & B).`);
    }
  }

  // Sort all anchors by document position
  anchors.sort((a, b) => a.pos - b.pos);

  // -------------------------------------------------------------------------
  // PHASE 2: SEQUENTIAL STREAM EVALUATION WITH CHAPTER INHERITANCE
  // -------------------------------------------------------------------------
  let activeCase: { caseId: string; caseTitle: string; caseScenario: string; seq: number } | null = null;

  for (let i = 0; i < anchors.length; i++) {
    const anchor = anchors[i];

    if (anchor.type === 'PAGE' && anchor.pageNum) {
      activePage = anchor.pageNum;
      continue;
    }

    if (anchor.type === 'CHAPTER' && anchor.chapterName) {
      activeChapter = anchor.chapterName;
      // Close active case when entering a new chapter
      activeCase = null;
      continue;
    }

    if (anchor.type === 'CASE' && anchor.caseId) {
      // Scenario is the text between the case heading and the first question inside it
      const nextQAnchor = anchors.slice(i + 1).find((a) => a.type === 'QUESTION');
      const scenarioEnd = nextQAnchor ? nextQAnchor.pos : Math.min(normalized.length, anchor.pos + 800);
      const rawScenario = normalized.slice(anchor.pos, scenarioEnd).replace(/(?:Case\s+(?:Scenario|Study|\d+)[:\s\-]*|Integrated\s+Case\s+Scenario\s*\d*[:\s\-]*)/i, '').trim();

      activeCase = {
        caseId: anchor.caseId,
        caseTitle: anchor.caseTitle || `${materialName} - Case`,
        caseScenario: rawScenario.length > 30 ? rawScenario : `Case study scenario based on ${materialName}.`,
        seq: 1,
      };

      if (!casesMap.has(anchor.caseId)) {
        casesMap.set(anchor.caseId, {
          caseId: anchor.caseId,
          caseTitle: activeCase.caseTitle,
          caseScenario: activeCase.caseScenario,
          chapter: activeChapter || 'Needs Review',
          difficulty: 'moderate',
          questions: [],
        });
      }
      continue;
    }

    if (anchor.type === 'QUESTION') {
      // Question block spans from this question anchor to the next QUESTION, CASE, or CHAPTER anchor
      const nextMajorAnchor = anchors.slice(i + 1).find((a) => a.type === 'QUESTION' || a.type === 'CASE' || a.type === 'CHAPTER');
      const blockEnd = nextMajorAnchor ? nextMajorAnchor.pos : normalized.length;
      const rawBlock = normalized.slice(anchor.pos, blockEnd);

      const parsedQ = parseSingleQuestionBlockDeterministic({
        rawBlock,
        rawMarker: anchor.rawMarker || '',
        course,
        subject,
        sourceCategory,
        attempt,
        materialName,
        sourceMaterialId,
        sourcePage: activePage,
        inheritedChapter: activeChapter,
        availableChapters,
        questionType: activeCase ? 'case_based' : 'normal',
        caseId: activeCase?.caseId,
        caseTitle: activeCase?.caseTitle,
        caseScenario: activeCase?.caseScenario,
        caseSequence: activeCase ? activeCase.seq++ : undefined,
      });

      if (parsedQ) {
        // De-duplicate within the same document pass
        const qKey = parsedQ.questionText.trim().toLowerCase();
        if (!processedQuestionTexts.has(qKey)) {
          processedQuestionTexts.add(qKey);
          questions.push(parsedQ);

          if (activeCase && casesMap.has(activeCase.caseId)) {
            casesMap.get(activeCase.caseId)!.questions.push(parsedQ);
          }

          chapterDistribution[parsedQ.chapter] = (chapterDistribution[parsedQ.chapter] || 0) + 1;
        }
      } else {
        rejectedCount++;
        rejectedReasons.push(`Question marker at char ${anchor.pos} could not be resolved into valid 4-option question draft.`);
      }
    }
  }

  // -------------------------------------------------------------------------
  // PHASE 3: AUDIT SUMMARY & CHAPTER METRICS CALCULATION
  // -------------------------------------------------------------------------
  let normalCount = 0;
  let caseBasedCount = 0;
  let validCount = 0;
  let needsReviewCount = 0;
  let chapterAssignedCount = 0;
  let needsChapterReviewCount = 0;
  let duplicateCount = 0;

  for (const q of questions) {
    if (q.questionType === 'case_based') {
      caseBasedCount++;
    } else {
      normalCount++;
    }

    if (q.isDuplicate) {
      duplicateCount++;
    }

    // Chapter accounting: Distinguish CHAPTER-MAPPED from NEEDS CHAPTER REVIEW
    if (q.chapter && q.chapter !== 'Needs Review' && availableChapters.includes(q.chapter)) {
      chapterAssignedCount++;
    } else {
      needsChapterReviewCount++;
      // Guarantee classification as 'Needs Review'
      q.chapter = 'Needs Review';
      q.needsReview = true;
      if (!q.reviewReason) q.reviewReason = 'Chapter mapping requires Admin verification.';
      if (!q.validationErrors.includes('Chapter requires Admin verification')) {
        q.validationErrors.push('Chapter requires Admin verification');
      }
    }

    if (q.needsReview || q.validationErrors.length > 0) {
      needsReviewCount++;
    } else {
      validCount++;
    }
  }

  // Ensure chapterDistribution accurately reflects 'Needs Review' count if present
  if (needsChapterReviewCount > 0) {
    chapterDistribution['Needs Review'] = needsChapterReviewCount;
  }

  return {
    materialName,
    course,
    subject,
    sourceCategory,
    attempt,
    totalDetected: questions.length,
    normalCount,
    caseBasedCount,
    validCount,
    needsReviewCount,
    chapterAssignedCount,
    needsChapterReviewCount,
    duplicateCount,
    rejectedCount,
    sourceExtractedCount: questions.filter((q) => q.explanationSource === 'SOURCE').length,
    aiAssistedCount: 0,
    aiExplanationDraftCount: 0,
    chapterDistribution,
    questions,
    cases: Array.from(casesMap.values()),
    rawTextSnippet: normalized.slice(0, 1500),
    pdfDiagnosis,
    rejectionReasons: rejectedReasons.slice(0, 20),
  };
}

/**
 * Parses individual MCQ block deterministically into structured question object.
 * Supports multi-line questions, multi-line options, explicit answers, and explanations.
 */
function parseSingleQuestionBlockDeterministic(params: {
  rawBlock: string;
  rawMarker: string;
  course: string;
  subject: string;
  sourceCategory: string;
  attempt?: string;
  materialName: string;
  sourceMaterialId?: string;
  sourcePage: number;
  inheritedChapter: string | null;
  availableChapters: string[];
  questionType: 'normal' | 'case_based';
  caseId?: string;
  caseTitle?: string;
  caseScenario?: string;
  caseSequence?: number;
}): ExtractedQuestionDraft | null {
  const {
    rawBlock,
    course,
    subject,
    sourceCategory,
    attempt,
    materialName,
    sourceMaterialId,
    sourcePage,
    inheritedChapter,
    availableChapters,
    questionType,
    caseId,
    caseTitle,
    caseScenario,
    caseSequence,
  } = params;

  // Clean embedded page markers from raw block for text continuity
  const blockCleaned = rawBlock.replace(/(?:^|\n)\s*---\s*Page\s*\d+\s*---\s*(?:\n|$)/gi, '\n');

  // 1. Locate Option A marker
  // Recognize (a), (A), [a], [A], (a)., (A)., [a]., [A]., A., A), A:
  const optAPosRegex = /(?:^|\n|\s)(?:\(([aA])\)\.?|\[([aA])\]\.?|([aA])[\.\):])\s+/;
  const matchAStart = blockCleaned.match(optAPosRegex);
  if (!matchAStart || matchAStart.index === undefined) {
    return null;
  }

  const optAIndex = matchAStart.index;

  // 2. Extract Multi-Line Question text
  let rawQuestionText = blockCleaned.slice(0, optAIndex).trim();

  // Strip leading question number/label: "Q1.", "Question 1:", "1.", "1)"
  rawQuestionText = rawQuestionText
    .replace(/^(?:Question|Q\.?)\s*(?:No\.?\s*)?\d{1,4}[\s.:\)-]+/i, '')
    .replace(/^\(?\d{1,4}\)?[\.\)]\s+/, '')
    .replace(/^\[\d{1,4}\]\s+/, '')
    .replace(/\r?\n/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (rawQuestionText.length < 5) {
    return null;
  }

  // 3. Locate Option B, C, D markers and boundaries
  const optionsBlock = blockCleaned.slice(optAIndex);

  // Markers for B, C, D
  const markerBRegex = /(?:^|\n|\s)(?:\(([bB])\)\.?|\[([bB])\]\.?|([bB])[\.\):])\s+/;
  const markerCRegex = /(?:^|\n|\s)(?:\(([cC])\)\.?|\[([cC])\]\.?|([cC])[\.\):])\s+/;
  const markerDRegex = /(?:^|\n|\s)(?:\(([dD])\)\.?|\[([dD])\]\.?|([dD])[\.\):])\s+/;

  // End of options marker (Answer, Explanation, Reference, Difficulty, etc.)
  const endOptionsRegex = /(?:^|\n|\s)(?:Answer|Ans\.?|Correct\s+Answer|Correct\s+Option|Key|Explanation|Expl\.?|Solution|Reason|Reference|Ref\.?|Difficulty|Topic|Unit|Source)[:\s\-]+/i;

  const matchB = optionsBlock.match(markerBRegex);
  if (!matchB || matchB.index === undefined) {
    return null;
  }

  const posB = matchB.index;
  const matchC = optionsBlock.slice(posB).match(markerCRegex);
  const posC = matchC && matchC.index !== undefined ? posB + matchC.index : -1;

  let posD = -1;
  if (posC !== -1) {
    const matchD = optionsBlock.slice(posC).match(markerDRegex);
    posD = matchD && matchD.index !== undefined ? posC + matchD.index : -1;
  }

  // Find end of option D or options block
  let posEnd = optionsBlock.length;
  const searchEndFrom = posD !== -1 ? posD : (posC !== -1 ? posC : posB);
  const matchEnd = optionsBlock.slice(searchEndFrom).match(endOptionsRegex);
  if (matchEnd && matchEnd.index !== undefined) {
    posEnd = searchEndFrom + matchEnd.index;
  }

  // Helper to sanitize option content without destroying multi-line text
  const cleanOption = (rawSlice: string, markerMatchStr?: string): string => {
    let s = rawSlice;
    if (markerMatchStr) {
      s = s.slice(markerMatchStr.length);
    }
    return s.replace(/\r?\n/g, ' ').replace(/\s{2,}/g, ' ').trim();
  };

  const optionA = cleanOption(optionsBlock.slice(0, posB), matchAStart[0]);
  const optionB = cleanOption(posC !== -1 ? optionsBlock.slice(posB, posC) : optionsBlock.slice(posB, posEnd), matchB[0]);
  const optionC = posC !== -1 ? cleanOption(posD !== -1 ? optionsBlock.slice(posC, posD) : optionsBlock.slice(posC, posEnd), matchC ? matchC[0] : '') : '';
  const optionD = posD !== -1 ? cleanOption(optionsBlock.slice(posD, posEnd), optionsBlock.slice(posD).match(markerDRegex)?.[0] || '') : '';

  if (!optionA || !optionB) {
    return null;
  }

  // 4. Deterministic Answer Extraction (NO GUESSING)
  let correctAnswer: 'A' | 'B' | 'C' | 'D' | '' = '';
  const answerRegexes = [
    /(?:Answer|Ans|Correct\s+Answer|Correct\s+Option|Key)[:\s\-]*\(?([a-dA-D])\)?/i,
    /(?:Answer|Ans)\.?\s*\(?([a-dA-D])\)?(?:\s|$)/i,
    /(?:Answer|Ans)\s*[-–—:]\s*\(?([a-dA-D])\)?/i,
    /(?:Answer|Ans)\s*\[([a-dA-D])\]/i,
    /(?:Option|Opt)\s*\(?([a-dA-D])\)?\s*is\s+correct/i,
    /\(Answer:\s*([a-dA-D])\)/i,
  ];

  for (const ar of answerRegexes) {
    const aMatch = blockCleaned.match(ar);
    if (aMatch && ['A', 'B', 'C', 'D'].includes(aMatch[1].toUpperCase())) {
      correctAnswer = aMatch[1].toUpperCase() as 'A' | 'B' | 'C' | 'D';
      break;
    }
  }

  // 5. Deterministic Explanation Extraction (NO AI)
  let explanation = '';
  const expMatch = blockCleaned.match(/(?:Explanation|Solution|Reason|Analysis|Rationale)[:\s\-]+([\s\S]*?)(?=(?:\n\s*(?:Reference|Ref|Source|Difficulty|Topic|Unit|$)))/i);
  if (expMatch && expMatch[1].trim().length > 5) {
    explanation = expMatch[1].trim().replace(/\r?\n/g, ' ').replace(/\s{2,}/g, ' ');
  } else {
    explanation = `As per authoritative ICAI study material guidelines for ${course.replace('_', ' ')} ${subject}.`;
  }

  // 6. Deterministic Reference Extraction
  let reference = '';
  const refMatch = blockCleaned.match(/(?:Reference|Ref|Source\s+Reference)[:\s\-]+([\s\S]*?)(?=(?:\n\s*(?:Difficulty|Topic|$)))/i);
  if (refMatch && refMatch[1].trim().length > 3) {
    reference = refMatch[1].trim().replace(/\r?\n/g, ' ').replace(/\s{2,}/g, ' ');
  } else {
    reference = `${sourceCategory}${attempt ? ` ${attempt}` : ''}${sourcePage ? `, Page ${sourcePage}` : ''}`;
  }

  // 7. Explicit Difficulty (NO AI inference)
  let difficulty: 'easy' | 'moderate' | 'hard' = 'moderate';
  if (/Difficulty:\s*Easy/i.test(blockCleaned)) difficulty = 'easy';
  else if (/Difficulty:\s*Hard/i.test(blockCleaned)) difficulty = 'hard';

  // 8. Explicit Topic Extraction
  let topic = 'Core Concept';
  const topicMatch = blockCleaned.match(/(?:Topic|Unit)[:\s\-]+([^\n\r]+)/i);
  if (topicMatch && topicMatch[1].trim().length > 3) {
    topic = topicMatch[1].trim().replace(/\s{2,}/g, ' ');
  }

  // 9. Chapter Inheritance & Mapping
  let assignedChapter = inheritedChapter;
  if (!assignedChapter) {
    // Contextual match from question text if no chapter was inherited
    for (const ch of availableChapters) {
      if (rawQuestionText.toLowerCase().includes(ch.toLowerCase())) {
        assignedChapter = ch;
        break;
      }
    }
  }

  if (!assignedChapter || !availableChapters.includes(assignedChapter)) {
    assignedChapter = 'Needs Review';
  }

  // 10. Duplicate Check
  const dupCheck = checkDuplicateQuestion(rawQuestionText);

  // 11. Validation Errors & Review Status
  const validationErrors: string[] = [];
  let needsReview = false;
  let reviewReason = '';

  if (!correctAnswer) {
    needsReview = true;
    reviewReason = 'Correct answer not explicitly stated in document. Needs Admin assignment.';
    validationErrors.push('Missing correct answer');
  }

  if (assignedChapter === 'Needs Review') {
    needsReview = true;
    if (!reviewReason) reviewReason = 'Chapter mapping requires Admin verification.';
    validationErrors.push('Chapter requires Admin verification');
  }

  if (!optionC || !optionD) {
    needsReview = true;
    validationErrors.push('All 4 options (A-D) recommended for ICAI examination standard.');
  }

  const tempId = `temp_q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const canonicalId = `mcq_${crypto.createHash('md5').update(`${rawQuestionText}_${optionA}_${optionB}`).digest('hex').slice(0, 16)}`;

  return {
    id: canonicalId,
    tempId,
    course,
    subject,
    chapter: assignedChapter,
    topic,
    questionType,
    caseId,
    caseTitle,
    caseScenario,
    caseSequence,
    difficulty,
    source: sourceCategory,
    attempt,
    questionText: rawQuestionText,
    optionA,
    optionB,
    optionC: optionC || 'None of the above',
    optionD: optionD || 'All of the above',
    correctAnswer,
    explanation,
    reference,
    sourceMaterialName: materialName,
    sourceMaterialId,
    sourcePage,
    isDuplicate: dupCheck.isDuplicate,
    duplicateExistingId: dupCheck.existingId,
    duplicateExistingSource: dupCheck.existingSource,
    needsReview,
    reviewReason,
    validationErrors,
    explanationSource: explanation && explanation.trim().length > 0 ? 'SOURCE' : 'MISSING',
    answerSource: correctAnswer && ['A', 'B', 'C', 'D'].includes(correctAnswer) ? 'SOURCE' : 'MISSING',
    aiAssisted: false,
  };
}
