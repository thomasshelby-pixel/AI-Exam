import zlib from 'zlib';
import { CA_CURRICULUM, CASubjectInfo } from '../../src/data/caCurriculum.js';

export interface SubjectValidationResult {
  isValid: boolean;
  isMismatch: boolean;
  selectedSubject: string;
  detectedSubject?: string;
  rejectionMessage?: string;
  confidence: number;
  evidence: string[];
}

interface SubjectSignature {
  key: string;
  name: string;
  level: string;
  primaryKeywords: string[];
  secondaryKeywords: string[];
}

const SUBJECT_SIGNATURES: SubjectSignature[] = [
  {
    key: 'inter_taxation',
    name: 'Taxation (Income Tax & GST)',
    level: 'INTERMEDIATE',
    primaryKeywords: [
      'income tax',
      'cgst',
      'sgst',
      'igst',
      '115bac',
      'sec 115bac',
      'section 115bac',
      'input tax credit',
      'gross total income',
      'order of discharge u/s 49(8)',
      'place of supply',
      'm/s rudra',
      'updated return u/s 139(8a)',
      '139(8a)',
      '139(1)',
      'section 54',
      'sec 54',
    ],
    secondaryKeywords: [
      'taxable salary',
      'house property',
      'capital gains',
      'pgbp',
      'standard deduction',
      'e-way bill',
      'reverse charge',
      'tds',
      'tcs',
      'advance tax',
      'gst liability',
      'time of supply',
      'inward supplies',
      'outward supplies',
      'set-off of itc',
    ],
  },
  {
    key: 'inter_advanced_accounting',
    name: 'Advanced Accounting',
    level: 'INTERMEDIATE',
    primaryKeywords: [
      'balance sheet',
      'accounting standard',
      'cash flow statement',
      'internal reconstruction',
      'buy back of shares',
      'holding company',
      'consolidated balance sheet',
      'amalgamation',
      'branch accounting',
      'as 2',
      'as 3',
      'as 10',
      'as 14',
      'as 16',
      'as 19',
      'as 20',
      'as 28',
      'ind as',
    ],
    secondaryKeywords: [
      'profit and loss',
      'revaluation reserve',
      'goodwill',
      'minority interest',
      'schedule iii',
      'share capital',
      'capital reduction account',
      'realisation account',
      'statement of affairs',
      'liquidation',
    ],
  },
  {
    key: 'inter_corporate_law',
    name: 'Corporate and Other Laws',
    level: 'INTERMEDIATE',
    primaryKeywords: [
      'companies act',
      'board of directors',
      'annual general meeting',
      'agm',
      'memorandum of association',
      'articles of association',
      'prospectus',
      'debentures',
      'foreign exchange management act',
      'fema',
      'general clauses act',
      'interpretation of statutes',
      'limited liability partnership',
      'llp act',
    ],
    secondaryKeywords: [
      'ordinary resolution',
      'special resolution',
      'section 135',
      'corporate social responsibility',
      'csr',
      'independent director',
      'audit committee',
      'dividend',
      'charge',
    ],
  },
  {
    key: 'inter_costing',
    name: 'Cost and Management Accounting',
    level: 'INTERMEDIATE',
    primaryKeywords: [
      'cost sheet',
      'marginal costing',
      'material cost variance',
      'labour variance',
      'overhead variance',
      'activity based costing',
      'process costing',
      'joint products',
      'by-products',
      'budgetary control',
      'break even point',
      'p/v ratio',
    ],
    secondaryKeywords: [
      'prime cost',
      'factory overheads',
      'standard costing',
      'equivalent units',
      'abnormal loss',
      'abnormal gain',
      'reconciliation statement',
      'contract costing',
    ],
  },
  {
    key: 'inter_auditing',
    name: 'Auditing and Ethics',
    level: 'INTERMEDIATE',
    primaryKeywords: [
      'standards on auditing',
      'sa 200',
      'sa 210',
      'sa 230',
      'sa 300',
      'sa 315',
      'sa 500',
      'sa 700',
      'caro 2020',
      'audit evidence',
      'internal control',
      'qualified opinion',
      'adverse opinion',
      'professional ethics',
      'code of ethics',
    ],
    secondaryKeywords: [
      'materiality',
      'audit sampling',
      'substantive procedures',
      'test of controls',
      'going concern',
      'subsequent events',
      'audit documentation',
      'peer review',
    ],
  },
  {
    key: 'inter_fm_sm',
    name: 'Financial Management and Strategic Management',
    level: 'INTERMEDIATE',
    primaryKeywords: [
      'wacc',
      'cost of capital',
      'capital structure',
      'operating leverage',
      'financial leverage',
      'capital budgeting',
      'npv',
      'irr',
      'working capital',
      'strategic management',
      'swot analysis',
      'porter',
      'bcg matrix',
    ],
    secondaryKeywords: [
      'dividend decision',
      'ratio analysis',
      'payback period',
      'strategic intent',
      'business model',
      'value chain',
    ],
  },
  {
    key: 'final_fr',
    name: 'Financial Reporting',
    level: 'FINAL',
    primaryKeywords: [
      'ind as 115',
      'ind as 116',
      'ind as 109',
      'ind as 103',
      'business combination',
      'financial instruments',
      'fair value measurement',
      'share based payment',
    ],
    secondaryKeywords: [
      'ind as 1',
      'ind as 2',
      'ind as 16',
      'ind as 19',
      'ind as 36',
      'ind as 38',
      'consolidation',
    ],
  },
  {
    key: 'final_afm',
    name: 'Advanced Financial Management',
    level: 'FINAL',
    primaryKeywords: [
      'portfolio management',
      'black scholes',
      'derivatives',
      'futures',
      'options',
      'foreign exchange exposure',
      'forex risk',
      'interest rate risk',
      'mergers and acquisitions',
    ],
    secondaryKeywords: [
      'sharpe ratio',
      'treynor',
      'var',
      'value at risk',
      'currency swap',
      'interest rate swap',
    ],
  },
  {
    key: 'final_direct_tax',
    name: 'Direct Tax Laws & International Taxation',
    level: 'FINAL',
    primaryKeywords: [
      'transfer pricing',
      'arm length price',
      'dtaa',
      'double taxation avoidance',
      'equalisation levy',
      'minimum alternate tax',
      'gaar',
      'search and seizure',
    ],
    secondaryKeywords: [
      'international taxation',
      'non-resident taxation',
      'tax audit',
      'assessment procedure',
    ],
  },
  {
    key: 'final_indirect_tax',
    name: 'Indirect Tax Laws',
    level: 'FINAL',
    primaryKeywords: [
      'customs act',
      'customs duty',
      'baggage rules',
      'warehousing under customs',
      'foreign trade policy',
      'advance ruling',
    ],
    secondaryKeywords: [
      'gst audit',
      'anti-profiteering',
      'classification of goods',
    ],
  },
];

/**
 * Extracts raw textual strings and tokens from a PDF buffer, including FlateDecode stream contents.
 */
export function extractTextTokensFromPdfBuffer(buffer: Buffer): string {
  if (!buffer || buffer.length < 50) return '';

  const extractedChunks: string[] = [];
  const bufStr = buffer.toString('latin1');

  // 1. Extract literal text within parenthesis: (text) Tj or (text) '
  const tjRegex = /\(([^)]+)\)\s*(?:Tj|'|")/g;
  let match: RegExpExecArray | null;
  while ((match = tjRegex.exec(bufStr)) !== null) {
    if (match[1] && match[1].length > 1) {
      extractedChunks.push(match[1]);
    }
  }

  // 2. Extract array text: [(t) 10 (e) 20 (x) 30 (t)] TJ
  const arrayTjRegex = /\[(.*?)\]\s*TJ/g;
  while ((match = arrayTjRegex.exec(bufStr)) !== null) {
    const inner = match[1];
    const parts = inner.match(/\(([^)]*)\)/g);
    if (parts) {
      const combined = parts.map((p) => p.slice(1, -1)).join('');
      if (combined.length > 1) {
        extractedChunks.push(combined);
      }
    }
  }

  // 3. Scan and inflate flate streams
  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let streamCount = 0;
  while ((match = streamRegex.exec(bufStr)) !== null && streamCount < 40) {
    streamCount++;
    try {
      const streamBytes = Buffer.from(match[1], 'latin1');
      const decompressed = zlib.inflateSync(streamBytes);
      const decStr = decompressed.toString('utf8');

      // Search for text tokens inside decompressed stream
      let decMatch: RegExpExecArray | null;
      while ((decMatch = tjRegex.exec(decStr)) !== null) {
        if (decMatch[1] && decMatch[1].length > 1) {
          extractedChunks.push(decMatch[1]);
        }
      }
      while ((decMatch = arrayTjRegex.exec(decStr)) !== null) {
        const inner = decMatch[1];
        const parts = inner.match(/\(([^)]*)\)/g);
        if (parts) {
          const combined = parts.map((p) => p.slice(1, -1)).join('');
          if (combined.length > 1) {
            extractedChunks.push(combined);
          }
        }
      }

      // Also grab clean alpha-numeric lines
      const words = decStr.match(/[a-zA-Z0-9_\(\)\/\.\s]{4,60}/g);
      if (words) {
        extractedChunks.push(...words.slice(0, 50));
      }
    } catch {
      // Not a standard flate stream or uncompressed; continue
    }
  }

  return extractedChunks.join(' ').toLowerCase();
}

/**
 * Validates whether the uploaded answer sheet belongs to the subject selected by the student.
 * Detects mismatches like selecting Advanced Accounting but uploading Taxation (Income Tax & GST).
 */
export function validateAnswerSheetSubject(params: {
  selectedSubjectKey: string;
  selectedSubjectName: string;
  filename?: string;
  fileBase64?: string;
  sampleText?: string;
  coverageSnippet?: string;
}): SubjectValidationResult {
  const {
    selectedSubjectKey,
    selectedSubjectName,
    filename = '',
    fileBase64 = '',
    sampleText = '',
    coverageSnippet = '',
  } = params;

  // Build combined searchable corpus
  let corpus = `${filename} ${sampleText} ${coverageSnippet}`.toLowerCase();

  if (fileBase64 && fileBase64.length > 100) {
    try {
      const buf = Buffer.from(fileBase64, 'base64');
      const pdfText = extractTextTokensFromPdfBuffer(buf);
      corpus += ` ${pdfText}`;
    } catch (e) {
      console.warn('[SubjectValidation] Buffer parsing error:', e);
    }
  }

  // Find signature for selected subject
  const normalizedKey = selectedSubjectKey.toLowerCase();
  const selectedSig =
    SUBJECT_SIGNATURES.find((s) => s.key.toLowerCase() === normalizedKey || normalizedKey.includes(s.key)) ||
    SUBJECT_SIGNATURES.find((s) => selectedSubjectName.toLowerCase().includes(s.name.toLowerCase()));

  // Score each subject signature against the document corpus
  const scores: Array<{ sig: SubjectSignature; score: number; hits: string[] }> = [];

  for (const sig of SUBJECT_SIGNATURES) {
    let score = 0;
    const hits: string[] = [];

    // Filename match has very high weight
    const normName = sig.name.toLowerCase();
    const cleanFn = filename.toLowerCase();
    if (
      (sig.key.includes('tax') && (cleanFn.includes('tax') || cleanFn.includes('gst') || cleanFn.includes('dt') || cleanFn.includes('idt'))) ||
      (sig.key.includes('accounting') && (cleanFn.includes('acc') || cleanFn.includes('adv_acc'))) ||
      (sig.key.includes('law') && cleanFn.includes('law')) ||
      (sig.key.includes('costing') && cleanFn.includes('cost')) ||
      (sig.key.includes('auditing') && cleanFn.includes('audit'))
    ) {
      score += 6;
      hits.push(`Filename indicates: ${sig.name}`);
    }

    for (const kw of sig.primaryKeywords) {
      if (corpus.includes(kw)) {
        score += 3;
        hits.push(kw);
      }
    }

    for (const kw of sig.secondaryKeywords) {
      if (corpus.includes(kw)) {
        score += 1;
        hits.push(kw);
      }
    }

    if (score > 0) {
      scores.push({ sig, score, hits });
    }
  }

  scores.sort((a, b) => b.score - a.score);

  const topMatch = scores[0];

  // If no strong evidence was found for ANY subject, allow standard processing
  if (!topMatch || topMatch.score < 3) {
    return {
      isValid: true,
      isMismatch: false,
      selectedSubject: selectedSubjectName,
      confidence: 50,
      evidence: [],
    };
  }

  // Check if top detected subject conflicts with the selected subject
  const isMatchSelected =
    selectedSig &&
    (topMatch.sig.key === selectedSig.key ||
      topMatch.sig.name.toLowerCase() === selectedSig.name.toLowerCase());

  // If the top detected subject is DIFFERENT from selected subject, and has strong score
  if (!isMatchSelected && topMatch.score >= 4) {
    // Check score of selected subject
    const selectedScoreItem = scores.find((s) => s.sig.key === selectedSig?.key);
    const selectedScore = selectedScoreItem?.score || 0;

    // If detected subject has materially higher score than selected subject
    if (topMatch.score >= selectedScore + 3 || selectedScore === 0) {
      const detectedName = topMatch.sig.name;
      const rejectionMessage = `Subject Mismatch Detected\n\nYou selected [${selectedSubjectName}], but the uploaded answer sheet appears to be for [${detectedName}].\n\nPlease upload the correct answer sheet to continue.`;

      console.warn(
        `[SubjectValidation] MISMATCH DETECTED: Selected "${selectedSubjectName}" vs Detected "${detectedName}" (Score: ${topMatch.score} vs ${selectedScore}). Hits: ${topMatch.hits.slice(0, 5).join(', ')}`
      );

      return {
        isValid: false,
        isMismatch: true,
        selectedSubject: selectedSubjectName,
        detectedSubject: detectedName,
        rejectionMessage,
        confidence: Math.min(99, 70 + topMatch.score * 4),
        evidence: topMatch.hits,
      };
    }
  }

  return {
    isValid: true,
    isMismatch: false,
    selectedSubject: selectedSubjectName,
    detectedSubject: topMatch.sig.name,
    confidence: Math.min(99, 60 + topMatch.score * 4),
    evidence: topMatch.hits,
  };
}
