export type ParakhChapterLanguage = 'english' | 'hindi' | 'hinglish';
export type ParakhChapterReplyMode = 'answer' | 'example' | 'simpler' | 'quiz';

const ICAI_FM_SOURCE_URL = 'https://www.icai.org/post/sm-inter-p6a-may2026';
const SOURCE_CHECKED_AT = '2026-11-08';

type FmChapter = {
  chapterNumber: number;
  title: string;
  module: 'MODULE 1' | 'MODULE 2';
  units: string[];
  contentStatus: 'AUTHOR_DRAFT_NOT_HUMAN_VERIFIED' | 'MAPPED_ONLY';
  benchmarkStatus: 'SELF_CHECKED_NOT_HUMAN_VERIFIED' | 'NOT_CREATED';
};

const FM_CHAPTERS: FmChapter[] = [
  { chapterNumber: 1, title: 'Scope and Objectives of Financial Management', module: 'MODULE 1', units: [], contentStatus: 'MAPPED_ONLY', benchmarkStatus: 'NOT_CREATED' },
  { chapterNumber: 2, title: 'Types of Financing', module: 'MODULE 1', units: [], contentStatus: 'MAPPED_ONLY', benchmarkStatus: 'NOT_CREATED' },
  { chapterNumber: 3, title: 'Financial Analysis and Planning – Ratio Analysis', module: 'MODULE 1', units: [], contentStatus: 'AUTHOR_DRAFT_NOT_HUMAN_VERIFIED', benchmarkStatus: 'SELF_CHECKED_NOT_HUMAN_VERIFIED' },
  { chapterNumber: 4, title: 'Cost of Capital', module: 'MODULE 1', units: [], contentStatus: 'MAPPED_ONLY', benchmarkStatus: 'NOT_CREATED' },
  { chapterNumber: 5, title: 'Financing Decisions – Capital Structure', module: 'MODULE 1', units: [], contentStatus: 'MAPPED_ONLY', benchmarkStatus: 'NOT_CREATED' },
  { chapterNumber: 6, title: 'Financing Decisions – Leverages', module: 'MODULE 1', units: [], contentStatus: 'MAPPED_ONLY', benchmarkStatus: 'NOT_CREATED' },
  { chapterNumber: 7, title: 'Investment Decisions', module: 'MODULE 2', units: [], contentStatus: 'MAPPED_ONLY', benchmarkStatus: 'NOT_CREATED' },
  { chapterNumber: 8, title: 'Dividend Decision', module: 'MODULE 2', units: [], contentStatus: 'MAPPED_ONLY', benchmarkStatus: 'NOT_CREATED' },
  {
    chapterNumber: 9,
    title: 'Management of Working Capital',
    module: 'MODULE 2',
    units: [
      'Introduction to Working Capital Management',
      'Treasury and Cash Management',
      'Management of Inventory',
      'Management of Receivables',
      'Management of Payables (Creditors)',
      'Financing of Working Capital',
    ],
    contentStatus: 'MAPPED_ONLY',
    benchmarkStatus: 'NOT_CREATED',
  },
];

type LocalisedText = Record<ParakhChapterLanguage, string>;

const RATIO_ANALYSIS = {
  id: 'intermediate-fm-chapter-3-ratio-analysis',
  chapterNumber: 3,
  title: 'Financial Analysis and Planning – Ratio Analysis',
  keywords: [
    'ratio analysis', 'financial ratio', 'financial ratios', 'fm ratio', 'fm ratios',
    'current ratio', 'quick ratio', 'liquidity ratio', 'debt equity ratio',
    'debt-equity ratio', 'interest coverage ratio', 'inventory turnover ratio',
    'receivables turnover ratio', 'gross profit ratio', 'net profit ratio',
    'operating ratio', 'return on capital employed', 'roce',
  ],
  answers: {
    english: [
      'Ratio analysis studies relationships between selected figures in financial statements. A ratio is useful only when you explain what it measures and interpret it in the context of the business, the period and any comparison given in the question.',
      '',
      'A practical way to organise the chapter is:',
      '• Liquidity: Current Ratio = Current Assets ÷ Current Liabilities. Quick Ratio = Quick Assets ÷ Current Liabilities; a common working calculation is (Current Assets − Inventory − Prepaid Expenses) ÷ Current Liabilities. Follow the exact quick-assets definition supplied in the question.',
      '• Activity: Inventory Turnover = Cost of Goods Sold ÷ Average Inventory. Trade Receivables Turnover = Net Credit Sales ÷ Average Trade Receivables. Collection Period = the stated period (often 365 days) ÷ Receivables Turnover.',
      '• Solvency: Debt-Equity Ratio compares the debt amount specified in the question with Shareholders’ Funds. Interest Coverage Ratio = EBIT ÷ Interest/Finance Cost. State which debt and earnings figures you have included.',
      '• Profitability: Gross Profit Ratio = Gross Profit ÷ Net Sales × 100. Net Profit Ratio = the specified net-profit measure ÷ Net Sales × 100. ROCE = EBIT ÷ Capital Employed × 100.',
      '',
      'For a numerical answer, show (1) the formula, (2) the figures selected, (3) any adjustment or average balance, (4) the calculation with units, and (5) a short interpretation. Use the question’s stated convention for items such as debt, net profit and capital employed; do not silently substitute a different definition. A ratio is not a verdict on its own—compare it with prior periods, a suitable benchmark or the facts supplied.',
    ].join('\n'),
    hinglish: [
      'Ratio Analysis mein financial statements ke selected numbers ke beech relationship study karte hain. Sirf ratio calculate karna enough nahi hai; ye bhi batana hota hai ki ratio kya measure karta hai aur business ke context mein iska kya meaning hai.',
      '',
      'Chapter ko 4 parts mein samajh:',
      '• Liquidity: Current Ratio = Current Assets ÷ Current Liabilities. Quick Ratio = Quick Assets ÷ Current Liabilities; common working formula hai (Current Assets − Inventory − Prepaid Expenses) ÷ Current Liabilities. Question mein quick assets ki jo definition di ho, wahi follow kar.',
      '• Activity: Inventory Turnover = Cost of Goods Sold ÷ Average Inventory. Receivables Turnover = Net Credit Sales ÷ Average Trade Receivables. Collection Period = given period (aksar 365 days) ÷ Receivables Turnover.',
      '• Solvency: Debt-Equity Ratio mein question ke hisaab se debt ko Shareholders’ Funds se compare karte hain. Interest Coverage = EBIT ÷ Interest/Finance Cost. Kaunsa debt aur earnings figure include kiya hai, clearly bata.',
      '• Profitability: Gross Profit Ratio = Gross Profit ÷ Net Sales × 100. Net Profit Ratio = question mein specified net-profit figure ÷ Net Sales × 100. ROCE = EBIT ÷ Capital Employed × 100.',
      '',
      'Har numerical mein 5 cheezein dikha: (1) formula, (2) sahi figures, (3) adjustment ya average balance, (4) calculation aur unit, (5) short interpretation. Debt, net profit aur capital employed ki definition question ke according hi rakhna—apni taraf se convention change mat karna. Ratio ko akela dekhkar final judgement mat dena; previous period ya question ke facts se compare kar.',
    ].join('\n'),
    hindi: [
      'Ratio Analysis में financial statements के चुने हुए आँकड़ों के बीच संबंध का अध्ययन किया जाता है। केवल ratio निकालना पर्याप्त नहीं है; यह समझाना भी ज़रूरी है कि वह क्या मापता है और business के संदर्भ में उसका क्या अर्थ है।',
      '',
      'इस chapter को चार भागों में समझें:',
      '• Liquidity: Current Ratio = Current Assets ÷ Current Liabilities. Quick Ratio = Quick Assets ÷ Current Liabilities; सामान्य working formula है (Current Assets − Inventory − Prepaid Expenses) ÷ Current Liabilities। प्रश्न में quick assets की जो परिभाषा दी हो, उसी का पालन करें।',
      '• Activity: Inventory Turnover = Cost of Goods Sold ÷ Average Inventory. Receivables Turnover = Net Credit Sales ÷ Average Trade Receivables. Collection Period = प्रश्न में दी गई अवधि (अक्सर 365 days) ÷ Receivables Turnover.',
      '• Solvency: Debt-Equity Ratio में प्रश्न के अनुसार debt की तुलना Shareholders’ Funds से करें। Interest Coverage = EBIT ÷ Interest/Finance Cost। कौन-सा debt और earnings figure शामिल किया है, यह स्पष्ट लिखें।',
      '• Profitability: Gross Profit Ratio = Gross Profit ÷ Net Sales × 100. Net Profit Ratio = प्रश्न में निर्दिष्ट net-profit figure ÷ Net Sales × 100. ROCE = EBIT ÷ Capital Employed × 100.',
      '',
      'हर numerical में (1) formula, (2) चुने गए आँकड़े, (3) adjustment या average balance, (4) unit सहित calculation और (5) छोटी interpretation दिखाएँ। Debt, net profit और capital employed की definition प्रश्न के अनुसार रखें; चुपचाप दूसरी definition न अपनाएँ। किसी ratio को अकेले देखकर निष्कर्ष न दें—उसे previous period, उपयुक्त benchmark या प्रश्न के facts से compare करें।',
    ].join('\n'),
  } satisfies Record<ParakhChapterLanguage, string>,
  examples: {
    english: [
      'Example — Current Ratio and Quick Ratio',
      'Current Assets = ₹3,00,000; Inventory = ₹75,000; Prepaid Expenses = ₹5,000; Current Liabilities = ₹1,50,000.',
      'Current Ratio = ₹3,00,000 ÷ ₹1,50,000 = 2.00 : 1.',
      'Quick Assets = ₹3,00,000 − ₹75,000 − ₹5,000 = ₹2,20,000.',
      'Quick Ratio = ₹2,20,000 ÷ ₹1,50,000 = 1.47 : 1 (rounded to two decimals).',
      'Interpretation: current assets are ₹2 for every ₹1 of current liabilities. The quick ratio removes inventory and prepayments from the numerator in this illustration. Do not call either result automatically good or bad without considering asset quality, timing and the question’s context.',
      '',
      'Second check — Inventory Turnover',
      'Cost of Goods Sold = ₹6,00,000; Average Inventory = ₹1,00,000.',
      'Inventory Turnover = ₹6,00,000 ÷ ₹1,00,000 = 6 times.',
    ].join('\n'),
    hinglish: [
      'Example — Current Ratio aur Quick Ratio',
      'Current Assets = ₹3,00,000; Inventory = ₹75,000; Prepaid Expenses = ₹5,000; Current Liabilities = ₹1,50,000.',
      'Current Ratio = ₹3,00,000 ÷ ₹1,50,000 = 2.00 : 1.',
      'Quick Assets = ₹3,00,000 − ₹75,000 − ₹5,000 = ₹2,20,000.',
      'Quick Ratio = ₹2,20,000 ÷ ₹1,50,000 = 1.47 : 1 (2 decimal tak round).',
      'Meaning: har ₹1 current liability ke against ₹2 current assets hain. Quick ratio mein is example ke andar inventory aur prepayments hata diye. Sirf ratio dekhkar good/bad mat bolna; assets ki quality, timing aur question ka context bhi dekh.',
      '',
      'Second check — Inventory Turnover',
      'Cost of Goods Sold = ₹6,00,000; Average Inventory = ₹1,00,000.',
      'Inventory Turnover = ₹6,00,000 ÷ ₹1,00,000 = 6 times.',
    ].join('\n'),
    hindi: [
      'उदाहरण — Current Ratio और Quick Ratio',
      'Current Assets = ₹3,00,000; Inventory = ₹75,000; Prepaid Expenses = ₹5,000; Current Liabilities = ₹1,50,000.',
      'Current Ratio = ₹3,00,000 ÷ ₹1,50,000 = 2.00 : 1.',
      'Quick Assets = ₹3,00,000 − ₹75,000 − ₹5,000 = ₹2,20,000.',
      'Quick Ratio = ₹2,20,000 ÷ ₹1,50,000 = 1.47 : 1 (दो दशमलव तक rounded)।',
      'अर्थ: हर ₹1 current liability के सामने ₹2 current assets हैं। इस उदाहरण में quick ratio के numerator से inventory और prepayments हटाए गए हैं। केवल ratio देखकर अच्छा/बुरा निष्कर्ष न दें; asset quality, timing और प्रश्न का context भी देखें।',
      '',
      'दूसरी जाँच — Inventory Turnover',
      'Cost of Goods Sold = ₹6,00,000; Average Inventory = ₹1,00,000.',
      'Inventory Turnover = ₹6,00,000 ÷ ₹1,00,000 = 6 times.',
    ].join('\n'),
  } satisfies Record<ParakhChapterLanguage, string>,
  simpler: {
    english: 'Think of each ratio as an answer to a business question. Current Ratio asks whether short-term assets cover short-term liabilities. Quick Ratio asks the same question after removing less-liquid items such as inventory and prepayments under the convention used. Turnover ratios ask how quickly inventory or receivables move. Profitability ratios show profit relative to sales or capital. First identify the question, then choose the matching numerator and denominator. Never mix figures from different periods.',
    hinglish: 'Har ratio ko ek business question ka answer samajh. Current Ratio poochta hai ki short-term assets se short-term liabilities cover hoti hain ya nahi. Quick Ratio mein convention ke according inventory aur prepayments jaise less-liquid items hata dete hain. Turnover ratios speed batate hain; profitability ratios sales ya capital ke comparison mein profit dikhate hain. Pehle question samajh, phir matching numerator-denominator choose kar. Different periods ke numbers mix mat kar.',
    hindi: 'हर ratio को एक business question का उत्तर समझें। Current Ratio बताता है कि short-term assets से short-term liabilities cover होती हैं या नहीं। Quick Ratio में अपनाई गई convention के अनुसार inventory और prepayments जैसे कम liquid items हटाए जाते हैं। Turnover ratios गति बताते हैं और profitability ratios sales या capital की तुलना में profit दिखाते हैं। पहले प्रश्न समझें, फिर सही numerator और denominator चुनें। अलग-अलग periods के आँकड़े mix न करें।',
  } satisfies Record<ParakhChapterLanguage, string>,
  quizzes: {
    english: 'Try this without looking at the example: Current Assets are ₹4,80,000, Inventory is ₹1,20,000, Prepaid Expenses are ₹20,000 and Current Liabilities are ₹2,00,000. Calculate (a) Current Ratio and (b) Quick Ratio. Show both formulas and one sentence explaining why the results differ.',
    hinglish: 'Example dekhe bina solve kar: Current Assets ₹4,80,000, Inventory ₹1,20,000, Prepaid Expenses ₹20,000 aur Current Liabilities ₹2,00,000 hain. (a) Current Ratio aur (b) Quick Ratio calculate kar. Dono formulas dikha aur ek line mein bata ki results alag kyun hain.',
    hindi: 'उदाहरण देखे बिना हल करें: Current Assets ₹4,80,000, Inventory ₹1,20,000, Prepaid Expenses ₹20,000 और Current Liabilities ₹2,00,000 हैं। (a) Current Ratio और (b) Quick Ratio निकालें। दोनों formulas दिखाएँ और एक वाक्य में बताएँ कि दोनों परिणाम अलग क्यों हैं।',
  } satisfies Record<ParakhChapterLanguage, string>,
};

export type ParakhFmRatioBenchmarkFamily =
  | 'core_concept'
  | 'unseen_numerical_or_application'
  | 'exam_style_question'
  | 'edge_case_and_common_mistake'
  | 'source_sensitive_or_amendment_check';

export const PARAKH_FM_RATIO_BENCHMARKS: Array<{
  id: string;
  family: ParakhFmRatioBenchmarkFamily;
  question: string;
  purpose: string;
}> = [
  {
    id: 'fm-ratio-core-concept',
    family: 'core_concept',
    question: 'Explain what ratio analysis tells a finance manager and why a ratio should not be interpreted in isolation.',
    purpose: 'Checks concept meaning and contextual interpretation.',
  },
  {
    id: 'fm-ratio-unseen-liquidity',
    family: 'unseen_numerical_or_application',
    question: 'Current assets are ₹4,80,000, inventory ₹1,20,000, prepayments ₹20,000 and current liabilities ₹2,00,000. Calculate current and quick ratios.',
    purpose: 'Checks a fresh liquidity calculation and complete workings.',
  },
  {
    id: 'fm-ratio-exam-presentation',
    family: 'exam_style_question',
    question: 'Calculate inventory turnover using cost of goods sold of ₹7,20,000 and opening and closing inventory of ₹1,00,000 and ₹1,40,000. Show the average balance and interpretation.',
    purpose: 'Checks average inventory, formula, units and presentation.',
  },
  {
    id: 'fm-ratio-edge-case',
    family: 'edge_case_and_common_mistake',
    question: 'What should be reported when current liabilities are zero, or when only closing inventory is provided for a turnover calculation?',
    purpose: 'Checks division-by-zero handling and avoids inventing an average balance.',
  },
  {
    id: 'fm-ratio-attempt-source',
    family: 'source_sensitive_or_amendment_check',
    question: 'Is this exact ratio treatment applicable to my upcoming examination attempt, including all current amendments?',
    purpose: 'Must direct the student to the exact attempt's ICAI material/RTP and must not infer applicability from a generic chapter map.',
  },
];

const RATIO_ALIASES = [
  'ratio analysis',
  'financial ratio',
  'financial ratios',
  'fm ratio',
  'fm ratios',
  'current ratio',
  'quick ratio',
  'liquidity ratio',
  'debt equity ratio',
  'debt-equity ratio',
  'interest coverage ratio',
  'inventory turnover ratio',
  'receivables turnover ratio',
  'gross profit ratio',
  'net profit ratio',
  'operating ratio',
  'return on capital employed',
  'roce',
];

function normalize(value: string): string {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function getReplyMode(message: string): ParakhChapterReplyMode {
  if (/\b(example|illustrate|numerical example|worked example)\b/i.test(message)) return 'example';
  if (/\b(simpler|simple words|easy language|easier|aasaan|आसान)\b/i.test(message)) return 'simpler';
  if (/\b(quiz|test me|self test|practice question|ask me a question|question for me)\b/i.test(message)) return 'quiz';
  return 'answer';
}

export interface ParakhChapterKnowledgeSource {
  title: string;
  url: string;
  publisher: 'Institute of Chartered Accountants of India';
  sourceType: 'OFFICIAL_CHAPTER_CATALOGUE';
  note: string;
}

export interface ParakhChapterKnowledgeMatch {
  topicId: string;
  topicTitle: string;
  course: 'CA_INTERMEDIATE';
  paperCode: 'INT-G2-P6';
  section: 'Section A: Financial Management';
  chapterNumber: number;
  syllabusApplicability: 'May 2026 examination onwards';
  contentReviewStatus: 'AUTHOR_DRAFT_NOT_HUMAN_VERIFIED';
  benchmarkStatus: 'SELF_CHECKED_NOT_HUMAN_VERIFIED';
  mode: ParakhChapterReplyMode;
  answer: string;
  source: ParakhChapterKnowledgeSource;
}

export function searchParakhChapterKnowledge(input: {
  message: string;
  course: string;
  language: ParakhChapterLanguage;
}): ParakhChapterKnowledgeMatch | null {
  const message = String(input.message || '').trim();
  if (!message || input.course !== 'CA_INTERMEDIATE') return null;

  // Attempt-sensitive or legal/current wording must use the live source route,
  // never this evergreen authored content.
  if (/\b(latest|most recent|recent amendment|latest amendment|current amendment|amended|as of today|as on today|applicable for (?:may|september|november|january)|upcoming attempt|my attempt)\b/i.test(message)) {
    return null;
  }
  if (/\bcurrent\b/i.test(message) && !/\bcurrent\s+ratio\b/i.test(message)) return null;

  const normalized = normalize(message);
  const matched = RATIO_ALIASES.some((alias) => {
    const needle = normalize(alias);
    return normalized.includes(needle);
  }) || (/\bratio(s)?\b/i.test(message) && /\b(fm|financial management|liquidity|solvency|profitability)\b/i.test(message));
  if (!matched) return null;

  const mode = getReplyMode(message);
  const language = input.language;
  return {
    topicId: RATIO_ANALYSIS.id,
    topicTitle: RATIO_ANALYSIS.title,
    course: 'CA_INTERMEDIATE',
    paperCode: 'INT-G2-P6',
    section: 'Section A: Financial Management',
    chapterNumber: 3,
    syllabusApplicability: 'May 2026 examination onwards',
    contentReviewStatus: 'AUTHOR_DRAFT_NOT_HUMAN_VERIFIED',
    benchmarkStatus: 'SELF_CHECKED_NOT_HUMAN_VERIFIED',
    mode,
    answer: mode === 'example' ? RATIO_ANALYSIS.examples[language]
      : mode === 'simpler' ? RATIO_ANALYSIS.simpler[language]
        : mode === 'quiz' ? RATIO_ANALYSIS.quizzes[language]
          : RATIO_ANALYSIS.answers[language],
    source: {
      title: 'ICAI Intermediate Paper 6A — Financial Management, Chapter 3 (official chapter catalogue)',
      url: ICAI_FM_SOURCE_URL,
      publisher: 'Institute of Chartered Accountants of India',
      sourceType: 'OFFICIAL_CHAPTER_CATALOGUE',
      note: 'Official chapter catalogue only. The explanation and numerical illustrations in PARAKH are original; ICAI study-material text is not reproduced here. Verify your exact attempt’s applicable material and RTP.',
    },
  };
}

export function buildParakhChapterKnowledgeReply(
  result: ParakhChapterKnowledgeMatch,
  language: ParakhChapterLanguage,
): string {
  const heading = language === 'hindi' ? 'अध्याय' : 'Chapter';
  const nextStep = result.mode === 'quiz' ? '' : language === 'hindi'
    ? '\n\nअगला step: चाहें तो एक और numerical या short self-test माँगें।'
    : language === 'hinglish'
      ? '\n\nNext step: chahe toh ek aur numerical ya quick self-test maang le.'
      : '\n\nNext step: ask for another numerical or a quick self-test if useful.';
  const reviewNote = language === 'hindi'
    ? '\n\nध्यान दें: यह PARAKH की original learning explanation है, ICAI का reproduced text नहीं। अपने exact attempt की applicable study material और RTP से final syllabus treatment verify करें।'
    : language === 'hinglish'
      ? '\n\nNote: ye PARAKH ki original learning explanation hai, ICAI material ka copied text nahi. Apne exact attempt ki applicable study material aur RTP se final syllabus treatment verify kar.'
      : '\n\nNote: this is PARAKH’s original learning explanation, not reproduced ICAI text. Verify final syllabus treatment against the study material and RTP applicable to your exact attempt.';
  return '**' + heading + ': ' + result.topicTitle + '**\n\n' + result.answer + nextStep + reviewNote;
}

export function getParakhChapterKnowledgeInventory(): {
  course: 'CA_INTERMEDIATE';
  paperCode: 'INT-G2-P6';
  paperTitle: 'Financial Management and Strategic Management';
  section: 'Section A: Financial Management';
  syllabusApplicability: 'May 2026 examination onwards';
  sourceCheckedAt: string;
  sourceUrl: string;
  chapterCount: number;
  authoredContentCount: number;
  humanReviewedContentCount: 0;
  benchmarkCaseCount: number;
  humanReviewedBenchmarkCount: 0;
  chapters: Array<{
    chapterNumber: number;
    title: string;
    module: string;
    units: string[];
    contentStatus: string;
    benchmarkStatus: string;
  }>;
  limitations: string[];
} {
  return {
    course: 'CA_INTERMEDIATE',
    paperCode: 'INT-G2-P6',
    paperTitle: 'Financial Management and Strategic Management',
    section: 'Section A: Financial Management',
    syllabusApplicability: 'May 2026 examination onwards',
    sourceCheckedAt: SOURCE_CHECKED_AT,
    sourceUrl: ICAI_FM_SOURCE_URL,
    chapterCount: FM_CHAPTERS.length,
    authoredContentCount: FM_CHAPTERS.filter((chapter) => chapter.contentStatus !== 'MAPPED_ONLY').length,
    humanReviewedContentCount: 0,
    benchmarkCaseCount: PARAKH_FM_RATIO_BENCHMARKS.length,
    humanReviewedBenchmarkCount: 0,
    chapters: FM_CHAPTERS.map((chapter) => ({
      ...chapter,
      units: [...chapter.units],
    })),
    limitations: [
      'The map covers CA Intermediate Paper 6A only; it is not a complete CA Foundation, Intermediate, Final or SPOM knowledge bank.',
      'Only Chapter 3 has an original authored content draft in this rollout. The other eight chapters are mapped, not taught by this pack.',
      'No chapter content or benchmark has been marked human-reviewed. Deterministic tests do not certify full academic correctness.',
      'Attempt-sensitive changes and statutory updates must be checked against the exact ICAI material, RTP and updates for the student’s attempt.',
    ],
  };
}
