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
  benchmarkStatus: 'PROMPTS_DEFINED_NOT_EVALUATED' | 'SELF_CHECKED_NOT_HUMAN_VERIFIED' | 'NOT_CREATED';
};

const FM_CHAPTERS: FmChapter[] = [
  { chapterNumber: 1, title: 'Scope and Objectives of Financial Management', module: 'MODULE 1', units: [], contentStatus: 'AUTHOR_DRAFT_NOT_HUMAN_VERIFIED', benchmarkStatus: 'PROMPTS_DEFINED_NOT_EVALUATED' },
  { chapterNumber: 2, title: 'Types of Financing', module: 'MODULE 1', units: [], contentStatus: 'AUTHOR_DRAFT_NOT_HUMAN_VERIFIED', benchmarkStatus: 'PROMPTS_DEFINED_NOT_EVALUATED' },
  { chapterNumber: 3, title: 'Financial Analysis and Planning – Ratio Analysis', module: 'MODULE 1', units: [], contentStatus: 'AUTHOR_DRAFT_NOT_HUMAN_VERIFIED', benchmarkStatus: 'PROMPTS_DEFINED_NOT_EVALUATED' },
  { chapterNumber: 4, title: 'Cost of Capital', module: 'MODULE 1', units: [], contentStatus: 'AUTHOR_DRAFT_NOT_HUMAN_VERIFIED', benchmarkStatus: 'PROMPTS_DEFINED_NOT_EVALUATED' },
  { chapterNumber: 5, title: 'Financing Decisions – Capital Structure', module: 'MODULE 1', units: [], contentStatus: 'AUTHOR_DRAFT_NOT_HUMAN_VERIFIED', benchmarkStatus: 'PROMPTS_DEFINED_NOT_EVALUATED' },
  { chapterNumber: 6, title: 'Financing Decisions – Leverages', module: 'MODULE 1', units: [], contentStatus: 'AUTHOR_DRAFT_NOT_HUMAN_VERIFIED', benchmarkStatus: 'PROMPTS_DEFINED_NOT_EVALUATED' },
  { chapterNumber: 7, title: 'Investment Decisions', module: 'MODULE 2', units: [], contentStatus: 'AUTHOR_DRAFT_NOT_HUMAN_VERIFIED', benchmarkStatus: 'PROMPTS_DEFINED_NOT_EVALUATED' },
  { chapterNumber: 8, title: 'Dividend Decision', module: 'MODULE 2', units: [], contentStatus: 'AUTHOR_DRAFT_NOT_HUMAN_VERIFIED', benchmarkStatus: 'PROMPTS_DEFINED_NOT_EVALUATED' },
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
    contentStatus: 'AUTHOR_DRAFT_NOT_HUMAN_VERIFIED',
    benchmarkStatus: 'PROMPTS_DEFINED_NOT_EVALUATED',
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
  'अनुपात विश्लेषण',
  'चालू अनुपात',
  'त्वरित अनुपात',
];


type OtherChapterPack = {
  id: string;
  chapterNumber: number;
  title: string;
  keywords: string[];
  answers: LocalisedText;
  examples: LocalisedText;
  simpler: LocalisedText;
  quizzes: LocalisedText;
};

const OTHER_FM_CHAPTERS: OtherChapterPack[] = [
  {
    id: 'intermediate-fm-chapter-1-scope-objectives',
    chapterNumber: 1,
    title: 'Scope and Objectives of Financial Management',
    keywords: ['financial management ke objectives', 'financial management ka objective', 'wealth maximisation kya hai', 'financial management ke goals', 'वित्तीय प्रबंधन के उद्देश्य', 'धन अधिकतमकरण', 'scope of financial management','objectives of financial management','wealth maximisation','wealth maximization','profit maximisation','profit maximization','financial management objective'],
    answers: {
      english: 'Financial management is the planning and control of how an organisation raises, uses and monitors money. Its three connected decision areas are investment (where funds are used), financing (where funds come from) and dividend/retention (how earnings are distributed or reinvested). A sound objective is long-term wealth maximisation: consider the amount, timing and risk of cash flows rather than only accounting profit. Liquidity, solvency, profitability and risk must be balanced; a project that raises reported profit can still destroy value if it ties up too much capital or carries excessive risk.',
      hinglish: 'Financial Management ka kaam hai organisation ke funds ko raise, use aur monitor karna. Iske 3 connected decisions hain: Investment—funds kahan lagane hain; Financing—funds kahan se laane hain; Dividend/Retention—profit distribute karna hai ya business mein reinvest. Long-term objective wealth maximisation hai, isliye sirf accounting profit nahi; cash flow ka amount, timing aur risk bhi dekh. Liquidity, solvency, profitability aur risk ko balance karna hota hai. Zyada reported profit wala project bhi value destroy kar sakta hai agar capital bahut block ho ya risk excessive ho.',
      hindi: 'Financial Management में संस्था के धन को जुटाने, उपयोग करने और नियंत्रित करने की योजना बनाई जाती है। इसके तीन जुड़े हुए निर्णय हैं: Investment—धन कहाँ लगाया जाए; Financing—धन कहाँ से जुटाया जाए; Dividend/Retention—कमाई बाँटी जाए या business में दोबारा लगाई जाए। दीर्घकालीन उद्देश्य wealth maximisation है; इसलिए केवल accounting profit नहीं, cash flow की राशि, समय और जोखिम भी देखें। Liquidity, solvency, profitability और risk में संतुलन आवश्यक है। अधिक reported profit वाला project भी value घटा सकता है यदि उसमें बहुत अधिक पूँजी फँसे या जोखिम असंगत हो।',
    },
    examples: {
      english: 'Illustration: Project A reports an accounting profit of ₹1,20,000 but requires a large immediate investment and has uncertain collections. Project B reports ₹1,00,000 with earlier, more predictable cash flows. Accounting profit alone cannot decide between them. Estimate incremental cash flows, timing, investment and risk, then compare value using the required decision method.',
      hinglish: 'Example: Project A ₹1,20,000 accounting profit dikhata hai, par shuru mein heavy investment aur uncertain collections hain. Project B ₹1,00,000 profit deta hai, lekin cash flows jaldi aur predictable hain. Sirf accounting profit se decision mat le. Incremental cash flows, timing, investment aur risk compare kar.',
      hindi: 'उदाहरण: Project A ₹1,20,000 accounting profit दिखाता है, लेकिन शुरुआत में बड़ा investment और अनिश्चित collections हैं। Project B ₹1,00,000 profit देता है, पर उसके cash flows जल्दी और अधिक predictable हैं। केवल accounting profit से निर्णय न लें। Incremental cash flows, उनका समय, investment और risk की तुलना करें।',
    },
    simpler: {
      english: 'Think of financial management as three questions: where should money be invested, how should it be raised, and how much should be retained or paid out? The goal is not merely a bigger profit figure; it is sustainable value after considering time and risk.',
      hinglish: 'Financial Management ko 3 sawaal samajh: paisa kahan invest karna hai, paisa kaise raise karna hai, aur profit kitna retain ya distribute karna hai? Goal sirf profit figure bada karna nahi; time aur risk dekhkar sustainable value create karna hai.',
      hindi: 'Financial Management के तीन सवाल हैं: धन कहाँ invest करना है, धन कैसे जुटाना है और कितना profit retain या distribute करना है? लक्ष्य केवल profit की संख्या बढ़ाना नहीं, बल्कि समय और जोखिम को ध्यान में रखकर टिकाऊ value बनाना है।',
    },
    quizzes: {
      english: 'A proposal increases accounting profit but delays cash receipts and sharply raises business risk. Explain why profit maximisation alone may be an inadequate decision rule, and identify the three core financial-management decisions.',
      hinglish: 'Ek proposal accounting profit badhata hai, lekin cash receipts delay karta hai aur business risk bhi badha deta hai. Samjha ki profit maximisation akela decision rule kyun enough nahi, aur Financial Management ke 3 core decisions identify kar.',
      hindi: 'एक proposal accounting profit बढ़ाता है, लेकिन cash receipts में देरी करता है और business risk भी बढ़ाता है। समझाएँ कि केवल profit maximisation पर्याप्त decision rule क्यों नहीं है और Financial Management के तीन मुख्य निर्णय बताइए।',
    },
  },
  {
    id: 'intermediate-fm-chapter-2-types-financing',
    chapterNumber: 2,
    title: 'Types of Financing',
    keywords: ['finance ke sources', 'funding ke types', 'funds kaise raise kare', 'वित्त के स्रोत', 'वित्तपोषण के प्रकार', 'types of financing','sources of finance','sources of financing','short term finance','short-term finance','medium term finance','long term finance','equity financing','debt financing','preference shares','debentures','retained earnings','trade credit','commercial paper','lease financing','factoring'],
    answers: {
      english: 'Financing sources can be compared by ownership, maturity, cost, repayment obligation, security, control and flexibility. Owners’ funds include equity and retained earnings; preference capital has specified dividend terms but its legal and financial character must be distinguished from debt; borrowed funds include loans and debentures. Short-term working-capital sources can include trade credit, bank working-capital facilities and eligible money-market instruments. Longer-term needs such as plant or expansion generally require funding whose maturity is aligned with the asset life. No source is automatically cheapest: include issue costs, tax effects where relevant, covenants, dilution, refinancing and cash-flow capacity.',
      hinglish: 'Financing sources ko ownership, maturity, cost, repayment, security, control aur flexibility ke basis par compare kar. Owners’ funds mein equity aur retained earnings aate hain; preference capital ki dividend terms specified hoti hain, par uski legal/financial nature ko debt se mix mat kar. Borrowed funds mein loans aur debentures aate hain. Short-term working capital ke liye trade credit, bank facilities aur eligible money-market instruments ho sakte hain. Plant ya expansion jaise long-term assets ke liye maturity ko asset life se align kar. Koi source automatically cheapest nahi—issue cost, tax effect, covenants, dilution, refinancing aur cash-flow capacity bhi dekh.',
      hindi: 'Financing के स्रोतों की तुलना ownership, maturity, cost, repayment obligation, security, control और flexibility के आधार पर करें। Owners’ funds में equity और retained earnings आते हैं; preference capital की dividend terms निश्चित हो सकती हैं, लेकिन उसकी कानूनी और वित्तीय प्रकृति को debt के समान न मानें। Borrowed funds में loans और debentures शामिल हैं। Short-term working capital के लिए trade credit, bank facilities और पात्र money-market instruments उपयोगी हो सकते हैं। Plant या expansion जैसी दीर्घकालीन जरूरतों के लिए funding की maturity को asset life से मिलाएँ। कोई स्रोत अपने आप सबसे सस्ता नहीं होता—issue cost, tax effect, covenants, dilution, refinancing और cash-flow capacity भी देखें।',
    },
    examples: {
      english: 'Illustration: a retailer needs extra funds for inventory before a seasonal sales period and expects to collect cash within 90 days. A short-term facility may fit the timing better than issuing long-term equity. By contrast, a factory machine used for several years should not normally be funded entirely with a facility that must be repaid in a few weeks. Match the source tenor to the purpose and cash-conversion pattern.',
      hinglish: 'Example: retailer ko festive season se pehle inventory kharidne ke liye funds chahiye aur 90 din mein cash collect ho jayega. Timing ke hisaab se short-term facility long-term equity issue se better fit ho sakti hai. Lekin kai saal chalne wali factory machine ko kuch hafton mein repay hone wali facility se poora fund karna mismatch hoga. Source ki maturity ko purpose aur cash cycle se match kar.',
      hindi: 'उदाहरण: एक retailer को seasonal sales से पहले inventory खरीदने के लिए धन चाहिए और 90 दिनों में cash मिलने की उम्मीद है। समय के अनुसार short-term facility, long-term equity जारी करने से बेहतर हो सकती है। इसके विपरीत, कई वर्षों तक उपयोग होने वाली factory machine को कुछ सप्ताह में repay होने वाली facility से पूरी तरह finance करना maturity mismatch होगा। Source की maturity को उद्देश्य और cash cycle से मिलाएँ।',
    },
    simpler: {
      english: 'Ask four questions before choosing finance: how long is the money needed, who bears the risk, what is the total cost, and can the business meet repayments without harming operations?',
      hinglish: 'Finance choose karne se pehle 4 sawaal: paisa kitne time ke liye chahiye, risk kaun bear karega, total cost kya hai, aur repayment se operations disturb toh nahi honge?',
      hindi: 'Finance चुनने से पहले चार सवाल पूछें: धन कितने समय के लिए चाहिए, जोखिम कौन उठाएगा, कुल लागत क्या है और repayment से operations पर दबाव तो नहीं पड़ेगा?',
    },
    quizzes: {
      english: 'A business needs funds for a 60-day seasonal inventory build-up and separately plans to buy machinery with a five-year useful life. Suggest a suitable broad financing tenor for each and explain why maturity matching matters.',
      hinglish: 'Business ko 60-day seasonal inventory ke liye funds chahiye aur alag se 5 saal chalne wali machinery kharidni hai. Dono ke liye broad financing tenor suggest kar aur maturity matching ka reason bata.',
      hindi: 'एक business को 60 दिनों के seasonal inventory build-up के लिए धन चाहिए और अलग से पाँच वर्ष उपयोग होने वाली machinery खरीदनी है। दोनों के लिए उपयुक्त broad financing tenor सुझाएँ और maturity matching का कारण बताएँ।',
    },
  },
  {
    id: 'intermediate-fm-chapter-4-cost-of-capital',
    chapterNumber: 4,
    title: 'Cost of Capital',
    keywords: ['capital ki cost', 'पूंजी की लागत', 'पूंजी लागत', 'wacc kya hai', 'cost of capital','weighted average cost of capital','wacc','cost of debt','after tax cost of debt','cost of equity','cost of preference capital','capital asset pricing model','capm','dividend growth model','cost of retained earnings'],
    answers: {
      english: 'Cost of capital is the required return expected by providers of finance and is commonly used as a benchmark for investment decisions. Estimate the cost of each source using the method and data specified in the question, then combine source costs using the stated capital weights to obtain WACC. In a basic tax-adjusted debt calculation, after-tax cost of debt = pre-tax cost of debt × (1 − tax rate), where the interest tax shield is available and the question asks for an after-tax measure. Equity cost may be estimated using a dividend-growth approach or CAPM when the required assumptions and inputs are supplied. Keep book-value versus market-value weights, flotation costs, preference terms and tax assumptions explicit.',
      hinglish: 'Cost of Capital finance dene walon ka required return hai aur investment decisions ke liye benchmark ka kaam karta hai. Har source ka cost question mein diye method aur data se calculate kar, phir stated capital weights se combine karke WACC nikaal. Basic tax-adjusted debt formula: after-tax cost of debt = pre-tax cost of debt × (1 − tax rate), jab interest tax shield available ho aur after-tax measure manga ho. Equity cost dividend-growth method ya CAPM se estimate ho sakta hai, par required assumptions/data hone chahiye. Book vs market value weights, flotation cost, preference terms aur tax assumptions clearly likh.',
      hindi: 'Cost of Capital, finance उपलब्ध कराने वालों का अपेक्षित return है और investment decisions में benchmark का काम करता है। प्रत्येक source की cost प्रश्न में दिए method और data से निकालें, फिर दिए गए capital weights से combine करके WACC निकालें। Basic tax-adjusted debt formula: after-tax cost of debt = pre-tax cost of debt × (1 − tax rate), जब interest tax shield उपलब्ध हो और प्रश्न after-tax measure माँगे। Equity cost dividend-growth method या CAPM से estimate हो सकती है, बशर्ते आवश्यक assumptions और inputs दिए हों। Book-value बनाम market-value weights, flotation costs, preference terms और tax assumptions स्पष्ट रखें।',
    },
    examples: {
      english: 'Illustration: equity is 60% of capital and costs 14%; debt is 40% and its pre-tax cost is 10%; the applicable tax rate is 25% and interest is tax-deductible. After-tax debt cost = 10% × (1 − 0.25) = 7.5%. WACC = (60% × 14%) + (40% × 7.5%) = 8.4% + 3.0% = 11.4%. This result depends on the stated weights and tax assumption.',
      hinglish: 'Example: capital mein equity 60% hai aur cost 14%; debt 40% hai aur pre-tax cost 10%; tax rate 25% hai aur interest tax-deductible hai. After-tax debt cost = 10% × (1 − 0.25) = 7.5%. WACC = (60% × 14%) + (40% × 7.5%) = 8.4% + 3.0% = 11.4%. Result given weights aur tax assumption par dependent hai.',
      hindi: 'उदाहरण: capital में equity 60% है जिसकी cost 14% है; debt 40% है जिसकी pre-tax cost 10% है; applicable tax rate 25% है और interest tax-deductible है। After-tax debt cost = 10% × (1 − 0.25) = 7.5%। WACC = (60% × 14%) + (40% × 7.5%) = 8.4% + 3.0% = 11.4%। यह परिणाम दी गई weights और tax assumption पर निर्भर है।',
    },
    simpler: {
      english: 'Imagine every source of money has a price. Cost of capital measures that price. WACC is the weighted average of those prices, using the capital mix given in the question. Use the tax adjustment only when the question and tax assumptions support it.',
      hinglish: 'Har source of money ki ek price hoti hai—wahi Cost of Capital hai. WACC un prices ka weighted average hai, question mein diye capital mix ke basis par. Tax adjustment tabhi laga jab question aur tax assumptions support karein.',
      hindi: 'हर source of money की एक कीमत होती है—इसे Cost of Capital कहते हैं। WACC, capital mix के अनुसार उन costs का weighted average है। Tax adjustment तभी लगाएँ जब प्रश्न और tax assumptions उसका समर्थन करें।',
    },
    quizzes: {
      english: 'Equity is 70% of capital with a cost of 12%; debt is 30% with a pre-tax cost of 8%; the tax rate is 25% and interest is deductible. Calculate the after-tax debt cost and WACC, showing each weighted component.',
      hinglish: 'Equity capital ka 70% hai, cost 12%; debt 30% hai, pre-tax cost 8%; tax rate 25% hai aur interest deductible hai. After-tax debt cost aur WACC calculate kar; har weighted component dikha.',
      hindi: 'Equity capital का 70% है और उसकी cost 12% है; debt 30% है जिसकी pre-tax cost 8% है; tax rate 25% है और interest deductible है। After-tax debt cost और WACC निकालें तथा प्रत्येक weighted component दिखाएँ।',
    },
  },
  {
    id: 'intermediate-fm-chapter-5-capital-structure',
    chapterNumber: 5,
    title: 'Financing Decisions – Capital Structure',
    keywords: ['capital structure kya hai', 'debt equity mix', 'पूंजी संरचना', 'capital structure','capital structure decision','optimal capital structure','financial structure','ebit eps analysis','ebit-eps','net income approach','net operating income approach','traditional approach','modigliani miller','modigliani-miller','mm approach','capital gearing'],
    answers: {
      english: 'Capital structure is the mix of long-term sources used to finance a business, especially equity and debt. A financing choice affects the required return, financial risk, control, flexibility and the resilience of cash flows. The chapter compares capital-structure views such as Net Income, Net Operating Income, Traditional and Modigliani–Miller approaches, subject to their assumptions. EBIT–EPS analysis compares the earnings per share under alternative financing plans at different EBIT levels; it should not be used without checking risk, indifference points, tax assumptions and the stability of operating earnings. More debt can magnify returns to equity in favourable conditions but also creates fixed obligations and distress risk.',
      hinglish: 'Capital Structure business ke long-term funds ka mix hai, mainly equity aur debt. Funding choice required return, financial risk, control, flexibility aur cash-flow resilience ko affect karta hai. Chapter mein Net Income, Net Operating Income, Traditional aur Modigliani–Miller approaches padhe jaate hain—har approach ki assumptions alag hoti hain. EBIT–EPS analysis alag financing plans par different EBIT levels mein EPS compare karta hai; lekin risk, indifference point, tax assumptions aur operating earnings ki stability bhi check kar. Zyada debt favourable time mein equity return ko amplify karta hai, par fixed obligations aur distress risk bhi badhata hai.',
      hindi: 'Capital Structure business को finance करने के लिए उपयोग किए गए long-term sources, विशेषकर equity और debt, का मिश्रण है। Financing choice required return, financial risk, control, flexibility और cash-flow resilience को प्रभावित करती है। इस chapter में Net Income, Net Operating Income, Traditional और Modigliani–Miller approaches की तुलना होती है; प्रत्येक की assumptions अलग हैं। EBIT–EPS analysis अलग financing plans के अंतर्गत अलग EBIT स्तरों पर EPS की तुलना करता है; साथ में risk, indifference point, tax assumptions और operating earnings की स्थिरता भी जाँचें। अधिक debt अच्छे समय में equity return बढ़ा सकता है, लेकिन fixed obligations और distress risk भी बढ़ाता है।',
    },
    examples: {
      english: 'Illustration: a company raises ₹10,00,000 through debt at 10% annual interest. The fixed annual interest obligation is ₹1,00,000 before considering any other charges. If operating earnings rise, the residual for equity holders may rise faster; if operating earnings fall, the same interest still has to be serviced. Compare alternative plans at more than one EBIT level and consider cash-flow risk—not just the EPS at one forecast.',
      hinglish: 'Example: company ₹10,00,000 debt 10% annual interest par raise karti hai. Fixed annual interest ₹1,00,000 hoga, other charges alag. EBIT badhe toh equity holders ke liye residual earnings faster badh sakti hain; EBIT gire toh interest phir bhi dena hoga. Alternative plans ko multiple EBIT levels par compare kar aur cash-flow risk dekh—sirf ek forecast EPS nahi.',
      hindi: 'उदाहरण: company ₹10,00,000 debt पर 10% annual interest से धन जुटाती है। अन्य charges को छोड़कर fixed annual interest ₹1,00,000 होगा। Operating earnings बढ़ने पर equity holders के लिए बची earnings तेज़ी से बढ़ सकती हैं; earnings गिरने पर भी interest देना होगा। Alternative plans को कई EBIT levels पर compare करें और केवल एक forecast EPS नहीं, cash-flow risk भी देखें।',
    },
    simpler: {
      english: 'Capital structure asks: how much should the business fund with owners’ money and how much with borrowing? Debt may lower some financing costs but increases fixed payment pressure. The best mix depends on the business and the assumptions in the question.',
      hinglish: 'Capital Structure poochta hai: business owners ke funds kitne use kare aur borrowing kitni? Debt kuch cases mein financing cost kam kar sakta hai, par fixed payment ka pressure badhata hai. Best mix business aur question ki assumptions par depend karta hai.',
      hindi: 'Capital Structure का सवाल है: business owners के funds कितने उपयोग करे और borrowing कितनी? Debt कुछ स्थितियों में financing cost घटा सकता है, लेकिन fixed payments का दबाव बढ़ाता है। उचित mix business और प्रश्न की assumptions पर निर्भर करता है।',
    },
    quizzes: {
      english: 'A company is comparing an all-equity plan with a debt-equity plan. State two possible benefits and two risks of debt financing, and explain why an EBIT–EPS comparison at only one EBIT level can be misleading.',
      hinglish: 'Company all-equity plan aur debt-equity plan compare kar rahi hai. Debt financing ke 2 possible benefits aur 2 risks bata. Ye bhi samjha ki sirf ek EBIT level par EBIT–EPS comparison misleading kyun ho sakta hai.',
      hindi: 'Company all-equity plan और debt-equity plan की तुलना कर रही है। Debt financing के दो संभावित लाभ और दो जोखिम बताएँ। यह भी समझाएँ कि केवल एक EBIT level पर EBIT–EPS comparison भ्रामक क्यों हो सकता है।',
    },
  },
  {
    id: 'intermediate-fm-chapter-6-leverages',
    chapterNumber: 6,
    title: 'Financing Decisions – Leverages',
    keywords: ['operating leverage kya hai', 'financial leverage kya hai', 'combined leverage kya hai', 'लीवरेज', 'operating leverage','leverages','operating leverage','financial leverage','combined leverage','degree of operating leverage','degree of financial leverage','degree of combined leverage','dol','dfl','dcl','contribution and ebit'],
    answers: {
      english: 'Leverage measures how sensitive one financial result is to a change in another. Operating leverage arises from fixed operating costs: in the basic model, Degree of Operating Leverage (DOL) = Contribution ÷ EBIT. Financial leverage arises from fixed financing charges: in a simple debt-only case with no preference dividend, Degree of Financial Leverage (DFL) = EBIT ÷ EBT. Degree of Combined Leverage (DCL) = DOL × DFL, or Contribution ÷ EBT under the same simplified assumptions. Use the full prescribed formula where preference dividends or other fixed charges exist. High leverage magnifies both favourable and unfavourable changes; ratios become unstable or meaningless near zero/negative denominators.',
      hinglish: 'Leverage batata hai ek financial result doosre result ke change se kitna sensitive hai. Fixed operating costs se Operating Leverage aata hai: basic model mein DOL = Contribution ÷ EBIT. Fixed finance charges se Financial Leverage aata hai: simple debt-only case, preference dividend nahi ho, toh DFL = EBIT ÷ EBT. DCL = DOL × DFL, ya same simplified assumptions mein Contribution ÷ EBT. Preference dividend ya other fixed charges hon toh prescribed full formula use kar. High leverage profit ke saath loss ko bhi magnify karta hai; zero/negative denominator ke paas ratio unstable ya meaningless ho sakta hai.',
      hindi: 'Leverage बताता है कि एक financial result, दूसरे result में बदलाव के प्रति कितना sensitive है। Fixed operating costs से Operating Leverage आता है: basic model में DOL = Contribution ÷ EBIT। Fixed finance charges से Financial Leverage आता है: simple debt-only case में, जब preference dividend न हो, DFL = EBIT ÷ EBT। DCL = DOL × DFL, या उन्हीं simplified assumptions में Contribution ÷ EBT। Preference dividend या अन्य fixed charges होने पर prescribed full formula अपनाएँ। High leverage अच्छे परिणाम के साथ नुकसान को भी बढ़ाता है; zero/negative denominator के पास ratio अस्थिर या अर्थहीन हो सकता है।',
    },
    examples: {
      english: 'Illustration (debt-only, no preference dividend): Sales ₹5,00,000; variable costs ₹3,00,000; fixed operating costs ₹1,50,000; interest ₹25,000. Contribution = ₹2,00,000; EBIT = ₹50,000; EBT = ₹25,000. DOL = ₹2,00,000 ÷ ₹50,000 = 4 times. DFL = ₹50,000 ÷ ₹25,000 = 2 times. DCL = 4 × 2 = 8 times. State the assumptions because a preference dividend changes the DFL working.',
      hinglish: 'Example (sirf debt, preference dividend nahi): Sales ₹5,00,000; variable cost ₹3,00,000; fixed operating cost ₹1,50,000; interest ₹25,000. Contribution ₹2,00,000; EBIT ₹50,000; EBT ₹25,000. DOL = 2,00,000 ÷ 50,000 = 4 times. DFL = 50,000 ÷ 25,000 = 2 times. DCL = 4 × 2 = 8 times. Assumption likhna, kyunki preference dividend ho toh DFL working badalti hai.',
      hindi: 'उदाहरण (केवल debt, preference dividend नहीं): Sales ₹5,00,000; variable cost ₹3,00,000; fixed operating cost ₹1,50,000; interest ₹25,000। Contribution ₹2,00,000; EBIT ₹50,000; EBT ₹25,000। DOL = 2,00,000 ÷ 50,000 = 4 times। DFL = 50,000 ÷ 25,000 = 2 times। DCL = 4 × 2 = 8 times। Assumption अवश्य लिखें, क्योंकि preference dividend होने पर DFL की working बदलती है।',
    },
    simpler: {
      english: 'Operating leverage comes from fixed costs in operations. Financial leverage comes from fixed financing charges. Combined leverage shows how both layers together affect earnings available to equity. More leverage means more sensitivity in both directions.',
      hinglish: 'Operating leverage business ke fixed operating costs se aata hai. Financial leverage fixed interest/finance charges se. Combined leverage dono ka combined effect dikhata hai. Leverage zyada hoga toh profit bhi aur loss bhi zyada sensitive hoga.',
      hindi: 'Operating leverage business के fixed operating costs से आता है। Financial leverage fixed interest/finance charges से आता है। Combined leverage दोनों का संयुक्त प्रभाव दिखाता है। Leverage बढ़ने पर profit और loss, दोनों के प्रति sensitivity बढ़ती है।',
    },
    quizzes: {
      english: 'Sales are ₹8,00,000, variable costs ₹4,80,000, fixed operating costs ₹2,40,000 and interest ₹40,000. Assuming no preference dividend, calculate contribution, EBIT, EBT, DOL, DFL and DCL. State why the debt-only assumption matters.',
      hinglish: 'Sales ₹8,00,000, variable costs ₹4,80,000, fixed operating costs ₹2,40,000 aur interest ₹40,000 hain. Preference dividend nahi hai. Contribution, EBIT, EBT, DOL, DFL aur DCL calculate kar; debt-only assumption kyun important hai woh bata.',
      hindi: 'Sales ₹8,00,000, variable costs ₹4,80,000, fixed operating costs ₹2,40,000 और interest ₹40,000 हैं। Preference dividend नहीं है। Contribution, EBIT, EBT, DOL, DFL और DCL निकालें तथा debt-only assumption का महत्व बताएँ।',
    },
  },
  {
    id: 'intermediate-fm-chapter-7-investment-decisions',
    chapterNumber: 7,
    title: 'Investment Decisions',
    keywords: ['npv kaise nikale', 'investment decision kya hai', 'capital budgeting kya hai', 'निवेश निर्णय', 'capital budgeting', 'investment decisions','capital budgeting','net present value','npv','internal rate of return','irr','profitability index','payback period','discounted payback','cash flows','capital investment appraisal'],
    answers: {
      english: 'Investment decisions evaluate long-term projects using incremental cash flows, not accounting profit alone. Identify the initial outlay, operating cash flows, tax effects where relevant, working-capital investment and recovery, disposal proceeds and project life. NPV = present value of relevant future cash inflows − initial investment (with any later outflows also discounted). A positive NPV indicates value creation at the chosen discount rate, subject to the assumptions. IRR is the discount rate that makes NPV zero; PI compares present value of inflows with the investment. Payback measures recovery time but ignores cash flows after payback and, in its simple form, time value of money. For mutually exclusive projects, scale, timing and risk matter—do not select by one metric without checking the decision context.',
      hinglish: 'Investment decisions mein long-term projects ko incremental cash flows se evaluate karte hain, sirf accounting profit se nahi. Initial outlay, operating cash flows, tax effect (jab applicable ho), working-capital investment/recovery, disposal value aur project life identify kar. NPV = future relevant cash inflows ka present value − initial investment (later outflows bhi discount karo). Chosen discount rate par positive NPV value creation indicate karta hai, given assumptions. IRR woh discount rate hai jahan NPV zero hota hai; PI present value of inflows ko investment se compare karta hai. Simple Payback recovery time batata hai, lekin payback ke baad cash flows ignore karta hai aur time value bhi nahi. Mutually exclusive projects mein scale, timing aur risk check kar.',
      hindi: 'Investment decisions में long-term projects का मूल्यांकन incremental cash flows से किया जाता है, केवल accounting profit से नहीं। Initial outlay, operating cash flows, जहाँ लागू हो tax effects, working-capital investment और recovery, disposal proceeds तथा project life पहचानें। NPV = relevant future cash inflows का present value − initial investment (बाद के outflows को भी discount करें)। चुनी गई discount rate पर positive NPV value creation दर्शाता है, assumptions के अधीन। IRR वह discount rate है जहाँ NPV शून्य होता है; PI inflows के present value की investment से तुलना करता है। Simple Payback recovery time बताता है, लेकिन उसके बाद के cash flows और time value of money को नज़रअंदाज़ करता है। Mutually exclusive projects में scale, timing और risk भी देखें।',
    },
    examples: {
      english: 'Illustration: initial investment is ₹1,00,000. Cash inflows are ₹60,000 at the end of Year 1 and ₹60,000 at the end of Year 2. At a 10% discount rate, PV of inflows = ₹60,000/1.10 + ₹60,000/(1.10²) = ₹54,545.45 + ₹49,586.78 = ₹1,04,132.23. NPV = ₹1,04,132.23 − ₹1,00,000 = ₹4,132.23 (approximately positive). This conclusion assumes the cash flows and 10% rate are appropriate.',
      hinglish: 'Example: initial investment ₹1,00,000 hai. Year 1 ke end par ₹60,000 aur Year 2 ke end par ₹60,000 inflow hai. 10% discount rate par PV = 60,000/1.10 + 60,000/(1.10²) = ₹54,545.45 + ₹49,586.78 = ₹1,04,132.23. NPV = 1,04,132.23 − 1,00,000 = lagbhag +₹4,132.23. Decision is assumption par depend karta hai ki cash flows aur 10% rate relevant hain.',
      hindi: 'उदाहरण: initial investment ₹1,00,000 है। Year 1 के अंत में ₹60,000 और Year 2 के अंत में ₹60,000 inflow है। 10% discount rate पर PV = 60,000/1.10 + 60,000/(1.10²) = ₹54,545.45 + ₹49,586.78 = ₹1,04,132.23। NPV = ₹1,04,132.23 − ₹1,00,000 = लगभग +₹4,132.23। निष्कर्ष cash flows और 10% rate की उपयुक्तता पर निर्भर है।',
    },
    simpler: {
      english: 'NPV asks whether the value today of the project’s future cash flows is greater than what you pay today. Discount future cash to make different dates comparable. A positive NPV is favourable at that discount rate, provided the cash-flow estimates are sound.',
      hinglish: 'NPV poochta hai: future mein milne wale cash flows ki aaj ki value, aaj ke investment se zyada hai ya nahi? Different dates ko compare karne ke liye future cash ko discount kar. Estimates sahi hon aur NPV positive ho toh chosen rate par project favourable hai.',
      hindi: 'NPV पूछता है: future cash flows की आज की value, आज के investment से अधिक है या नहीं? अलग-अलग dates की तुलना के लिए future cash को discount करें। Estimates सही हों और NPV positive हो, तो चुनी गई rate पर project अनुकूल है।',
    },
    quizzes: {
      english: 'A project costs ₹1,00,000 today and returns ₹60,000 at each year-end for two years. At 10%, calculate the present value of inflows and NPV. State one limitation of payback period.',
      hinglish: 'Project aaj ₹1,00,000 cost karta hai aur 2 saal tak har year-end par ₹60,000 return deta hai. 10% par PV of inflows aur NPV nikaal. Payback period ki ek limitation bata.',
      hindi: 'एक project की आज लागत ₹1,00,000 है और दो वर्षों तक प्रत्येक वर्ष के अंत में ₹60,000 मिलता है। 10% पर inflows का present value और NPV निकालें। Payback period की एक limitation बताएँ।',
    },
  },
  {
    id: 'intermediate-fm-chapter-8-dividend-decision',
    chapterNumber: 8,
    title: 'Dividend Decision',
    keywords: ['dividend kya hota hai', 'profit distribute kaise kare', 'लाभांश', 'लाभांश नीति', 'dividend decision','dividend policy','dividend theories','dividend payout ratio','retention ratio','dividend yield','walter model','gordon model','mm dividend','modigliani miller dividend','stable dividend','residual dividend'],
    answers: {
      english: 'Dividend decision determines how much earnings are distributed to shareholders and how much is retained for reinvestment. The choice affects current shareholder income, internal funding, growth capacity, liquidity and market expectations. The chapter distinguishes dividend relevance and irrelevance views, including Walter, Gordon and Modigliani–Miller models under their stated assumptions. In practice, consider investment opportunities, access to external finance, stability of earnings, cash availability, legal restrictions, shareholder preferences and signalling effects. Accounting profit is not the same as cash available for dividend.',
      hinglish: 'Dividend Decision decide karta hai ki earnings ka kitna part shareholders ko distribute hoga aur kitna business mein retain hoga. Isse current shareholder income, internal funds, growth, liquidity aur market expectations affect hote hain. Chapter mein Walter, Gordon aur Modigliani–Miller jaise dividend relevance/irrelevance views unki assumptions ke saath padhe jaate hain. Practical decision mein investment opportunities, external finance access, earnings stability, cash availability, legal restrictions, shareholder preference aur signalling effect dekh. Accounting profit aur dividend ke liye available cash same nahi hote.',
      hindi: 'Dividend Decision तय करता है कि earnings का कितना भाग shareholders को दिया जाएगा और कितना business में retain होगा। इससे shareholder income, internal funding, growth capacity, liquidity और market expectations प्रभावित होते हैं। Chapter में Walter, Gordon और Modigliani–Miller models के dividend relevance/irrelevance views उनकी assumptions के साथ पढ़े जाते हैं। Practical निर्णय में investment opportunities, external finance, earnings stability, cash availability, legal restrictions, shareholder preferences और signalling effects देखें। Accounting profit और dividend के लिए उपलब्ध cash एक समान नहीं हैं।',
    },
    examples: {
      english: 'Illustration: earnings per share are ₹40 and dividend per share is ₹12. Payout ratio = ₹12/₹40 × 100 = 30%; retention ratio = 70%. This describes the earnings split, not whether the payout is sustainable. Check cash flows, investment needs, restrictions and future earnings before judging the policy.',
      hinglish: 'Example: EPS ₹40 hai aur dividend per share ₹12. Payout ratio = 12/40 × 100 = 30%; retention ratio = 70%. Ye sirf earnings ka split batata hai, sustainability nahi. Policy judge karne se pehle cash flow, investment need, restrictions aur future earnings check kar.',
      hindi: 'उदाहरण: EPS ₹40 है और dividend per share ₹12 है। Payout ratio = ₹12/₹40 × 100 = 30%; retention ratio = 70%। यह केवल earnings का विभाजन बताता है, sustainability नहीं। Policy का मूल्यांकन करने से पहले cash flows, investment needs, restrictions और future earnings जाँचें।',
    },
    simpler: {
      english: 'A company can pay earnings now or retain them to fund future growth. A higher dividend gives shareholders more immediate cash; higher retention may support investment but does not guarantee better returns. The right choice depends on opportunities and constraints.',
      hinglish: 'Company profit abhi dividend ke roop mein de sakti hai ya future growth ke liye retain kar sakti hai. Higher dividend se shareholder ko abhi cash milta hai; higher retention investment support kar sakta hai, par better return guarantee nahi. Sahi choice opportunities aur constraints par depend hai.',
      hindi: 'Company profit अभी dividend के रूप में दे सकती है या future growth के लिए retain कर सकती है। अधिक dividend से shareholder को तत्काल cash मिलता है; अधिक retention investment को support कर सकता है, लेकिन बेहतर return की guarantee नहीं। सही चुनाव अवसरों और सीमाओं पर निर्भर है।',
    },
    quizzes: {
      english: 'EPS is ₹50 and dividend per share is ₹15. Calculate payout and retention ratios. Then name two factors, other than accounting profit, that should influence the dividend decision.',
      hinglish: 'EPS ₹50 hai aur dividend per share ₹15 hai. Payout aur retention ratios nikaal. Phir accounting profit ke alawa do factors bata jo dividend decision ko influence karte hain.',
      hindi: 'EPS ₹50 है और dividend per share ₹15 है। Payout और retention ratios निकालें। फिर accounting profit के अतिरिक्त दो ऐसे factors बताएँ जो dividend decision को प्रभावित करते हैं।',
    },
  },
  {
    id: 'intermediate-fm-chapter-9-working-capital',
    chapterNumber: 9,
    title: 'Management of Working Capital',
    keywords: ['working capital kya hai', 'karyashil punji', 'कार्यशील पूंजी', 'cash management kya hai', 'working capital','working capital management','gross working capital','net working capital','operating cycle','cash management','treasury management','inventory management','receivables management','payables management','creditors management','working capital financing','cash conversion cycle','economic order quantity','eoq'],
    answers: {
      english: 'Working capital management ensures that day-to-day operations have enough funds without leaving excessive money idle. Gross working capital refers to current assets; net working capital is Current Assets − Current Liabilities. The operating cycle tracks time tied up in inventory and receivables, reduced by supplier-credit time. The chapter connects cash/treasury management, inventory, receivables, payables and working-capital financing. Each policy involves a trade-off: tighter credit may reduce bad debts but lose sales; more inventory may reduce stock-outs but increase carrying cost; delaying suppliers can preserve cash but damage terms or supply reliability. Funding should consider the duration and risk of the operating cycle.',
      hinglish: 'Working Capital Management ka aim hai daily operations ke liye enough funds rakhna, bina unnecessary cash idle chhode. Gross Working Capital = Current Assets; Net Working Capital = Current Assets − Current Liabilities. Operating cycle batata hai inventory aur receivables mein paisa kitne time block hai, jisme supplier credit period minus hota hai. Chapter cash/treasury, inventory, receivables, payables aur working-capital financing ko cover karta hai. Har policy mein trade-off hai: strict credit se bad debt kam ho sakta hai par sales lose ho sakti hain; zyada stock se stock-out kam par carrying cost badhti hai; supplier payment delay cash bachata hai par supply terms kharab ho sakte hain. Funding ko operating cycle ki duration aur risk se match kar.',
      hindi: 'Working Capital Management का उद्देश्य daily operations के लिए पर्याप्त funds उपलब्ध रखना है, बिना बहुत अधिक cash idle छोड़े। Gross Working Capital का अर्थ Current Assets और Net Working Capital = Current Assets − Current Liabilities है। Operating cycle बताता है कि inventory और receivables में धन कितने समय तक लगा रहता है; supplier credit period इसे कम करता है। इस chapter में cash/treasury, inventory, receivables, payables और working-capital financing शामिल हैं। प्रत्येक policy में trade-off है: सख्त credit से bad debts घट सकते हैं पर sales खो सकती हैं; अधिक inventory से stock-outs घट सकते हैं पर carrying cost बढ़ती है; supplier payment टालने से cash बचता है पर supply terms बिगड़ सकते हैं। Funding को operating cycle की अवधि और risk से मिलाएँ।',
    },
    examples: {
      english: 'Illustration: inventory holding period is 30 days, production/WIP period 10 days, finished-goods period 20 days, receivables collection period 40 days and supplier-credit period 25 days. A simplified operating cycle = 30 + 10 + 20 + 40 − 25 = 75 days. The exact cycle formula must follow the components and definitions supplied in the question; avoid double-counting inventory stages.',
      hinglish: 'Example: inventory holding 30 days, WIP/production 10 days, finished goods 20 days, receivables collection 40 days aur supplier credit 25 days hai. Simplified operating cycle = 30 + 10 + 20 + 40 − 25 = 75 days. Exact formula question ke components/definitions ke according rakhna; inventory stages double-count mat karna.',
      hindi: 'उदाहरण: inventory holding 30 दिन, WIP/production 10 दिन, finished goods 20 दिन, receivables collection 40 दिन और supplier credit 25 दिन है। Simplified operating cycle = 30 + 10 + 20 + 40 − 25 = 75 दिन। Exact formula प्रश्न में दिए components और definitions के अनुसार रखें; inventory stages को double-count न करें।',
    },
    simpler: {
      english: 'Working capital is the money moving through everyday business activity: buy materials, make or hold goods, sell, collect from customers and pay suppliers. The longer cash is tied up before collection, the more working-capital funding may be required.',
      hinglish: 'Working capital daily business mein ghoomta hua paisa hai: material kharido, goods banao/hold karo, sell karo, customer se collect karo aur supplier ko pay karo. Cash jitne zyada time tak cycle mein block rahega, utni working-capital funding ki need badh sakti hai.',
      hindi: 'Working capital वह धन है जो daily business cycle में चलता रहता है: material खरीदना, goods बनाना/रखना, बेचना, customer से collection करना और supplier को भुगतान करना। Collection से पहले cash जितने अधिक समय तक अटका रहेगा, working-capital funding की जरूरत उतनी बढ़ सकती है।',
    },
    quizzes: {
      english: 'Inventory holding is 35 days, WIP is 8 days, finished goods is 12 days, receivables are collected in 45 days and suppliers are paid after 30 days. Calculate the simplified operating cycle and explain one action that could shorten it.',
      hinglish: 'Inventory holding 35 days, WIP 8 days, finished goods 12 days, receivables collection 45 days aur supplier payment 30 days baad hota hai. Simplified operating cycle nikaal aur ek action bata jo ise shorten kar sakta hai.',
      hindi: 'Inventory holding 35 दिन, WIP 8 दिन, finished goods 12 दिन, receivables collection 45 दिन और suppliers को 30 दिन बाद भुगतान होता है। Simplified operating cycle निकालें और इसे कम करने का एक उपाय बताएँ।',
    },
  },
];

const FM_BENCHMARK_FAMILIES: Array<{ family: ParakhFmRatioBenchmarkFamily; purpose: string }> = [
  { family: 'core_concept', purpose: 'Checks understanding of the chapter’s central concept and terminology.' },
  { family: 'unseen_numerical_or_application', purpose: 'Checks transfer to a fresh numerical or practical situation.' },
  { family: 'exam_style_question', purpose: 'Checks orderly workings, assumptions and exam-oriented presentation.' },
  { family: 'edge_case_and_common_mistake', purpose: 'Checks an important limitation, assumption or common error.' },
  { family: 'source_sensitive_or_amendment_check', purpose: 'Checks that attempt-specific treatment is not guessed from evergreen content.' },
];

const OTHER_FM_BENCHMARK_QUESTIONS: Array<{ chapterNumber: number; questions: string[] }> = [
  {
    chapterNumber: 1,
    questions: [
      'Explain why long-term wealth maximisation is a broader objective than maximising one year’s accounting profit.',
      'A project costs ₹2,00,000 today and produces uncertain cash flows over four years. Identify the information needed before recommending it.',
      'A business must choose between a quick-profit project and a lower but more predictable return. Present a structured financial-management decision approach.',
      'Explain why a company can report a profit but still face a liquidity crisis.',
      'For the exact current attempt, identify which official ICAI material and updates must be checked before relying on a chapter treatment.',
    ],
  },
  {
    chapterNumber: 2,
    questions: [
      'Distinguish owners’ funds from borrowed funds using control, repayment and risk as comparison points.',
      'A retailer needs seasonal inventory finance for 60 days while also buying machinery for five years. Suggest broad financing tenors and justify the match.',
      'Compare a term loan and equity issue for funding a long-lived asset, including cost, control and repayment implications.',
      'Why is it unsafe to select a financing source only because its quoted interest rate appears lower?',
      'What attempt-specific source checks are necessary before applying current financing rules, market instrument eligibility or regulatory limits?',
    ],
  },
  {
    chapterNumber: 4,
    questions: [
      'Explain why the cost of capital is a required-return benchmark and not simply the coupon rate on debt.',
      'Equity is 70% of capital at 12%; debt is 30% at a pre-tax 8%; tax is 25% and interest is deductible. Calculate after-tax debt cost and WACC.',
      'Present the weighted-average cost of capital working, clearly identifying the capital weights and tax adjustment.',
      'Explain two errors that can occur when book-value weights, market-value weights or the tax shield are used without checking the question.',
      'A student asks whether the same cost-of-capital inputs and tax treatment apply to a later attempt. Explain what must be verified rather than assumed.',
    ],
  },
  {
    chapterNumber: 5,
    questions: [
      'Compare the Net Income and Net Operating Income approaches to capital structure at a conceptual level.',
      'A company has ₹10,00,000 debt at 10% interest. Calculate the fixed annual interest and explain how it affects equity risk.',
      'Compare two financing plans under more than one EBIT level and explain why an indifference-point analysis is relevant.',
      'Why can a debt-heavy plan show higher EPS at one EBIT but still be riskier or less suitable overall?',
      'Which assumptions must be confirmed before applying a particular capital-structure theory or statutory financing constraint to an attempt question?',
    ],
  },
  {
    chapterNumber: 6,
    questions: [
      'Distinguish operating leverage, financial leverage and combined leverage by the fixed costs that create them.',
      'Sales are ₹8,00,000, variable costs ₹4,80,000, fixed operating costs ₹2,40,000 and interest ₹40,000. With no preference dividend, calculate DOL, DFL and DCL.',
      'Show full leverage workings from sales through contribution, EBIT and EBT, stating the assumptions used.',
      'Explain why a leverage ratio should be treated cautiously when EBIT or EBT is zero, negative or very small.',
      'A problem includes preference dividends and debt interest. Explain why a simplified debt-only DFL formula may not be appropriate.',
    ],
  },
  {
    chapterNumber: 7,
    questions: [
      'Define NPV, IRR, profitability index and payback period, and state what each method is designed to measure.',
      'An investment of ₹1,00,000 produces ₹60,000 at each of the next two year-ends. At 10%, calculate PV of inflows and NPV.',
      'Prepare an NPV answer with the initial outlay, discounted annual inflows, total present value and decision.',
      'Explain why simple payback can give a misleading ranking when later cash flows or project scale differ.',
      'A project contains a tax rule or incentive that may have changed for the examination attempt. What official source and applicability checks are required?',
    ],
  },
  {
    chapterNumber: 8,
    questions: [
      'Explain the difference between dividend payout and retention and how each can affect future financing needs.',
      'EPS is ₹50 and dividend per share is ₹15. Calculate payout and retention ratios.',
      'Present a dividend-policy answer considering investment opportunities, liquidity, earnings stability and shareholder expectations.',
      'Why does accounting profit alone not establish that the same amount is available for distribution as dividend?',
      'Before using a current legal or regulatory dividend restriction in an answer, what official source and effective-date checks should be made?',
    ],
  },
  {
    chapterNumber: 9,
    questions: [
      'Distinguish gross working capital from net working capital and explain the role of the operating cycle.',
      'Inventory holding is 35 days, WIP 8 days, finished goods 12 days, receivables 45 days and supplier credit 30 days. Calculate the simplified operating cycle.',
      'A firm is reviewing cash, inventory, receivables and payables policies. Present a structured working-capital management approach.',
      'Explain the trade-off between extending customer credit and tightening credit policy to reduce receivables risk.',
      'A student asks whether a financing limit, bank norm or regulatory requirement is current for an upcoming attempt. What must be checked before answering?',
    ],
  },
];

const OTHER_FM_BENCHMARKS = OTHER_FM_BENCHMARK_QUESTIONS.flatMap(({ chapterNumber, questions }) =>
  questions.map((question, index) => ({
    id: 'fm-ch' + chapterNumber + '-benchmark-' + (index + 1),
    chapterNumber,
    family: FM_BENCHMARK_FAMILIES[index].family,
    question,
    purpose: FM_BENCHMARK_FAMILIES[index].purpose,
  })),
);

export const PARAKH_FM_CHAPTER_BENCHMARKS = [
  ...PARAKH_FM_RATIO_BENCHMARKS.map((benchmark) => ({ ...benchmark, chapterNumber: 3 })),
  ...OTHER_FM_BENCHMARKS,
];

function normalize(value: string): string {
  return String(value || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
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
  syllabusApplicability: string;
  contentReviewStatus: 'AUTHOR_DRAFT_NOT_HUMAN_VERIFIED';
  benchmarkStatus: 'PROMPTS_DEFINED_NOT_EVALUATED';
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
    return (' ' + normalized + ' ').includes(' ' + needle + ' ');
  }) || (/\bratio(s)?\b/i.test(message) && /\b(fm|financial management|liquidity|solvency|profitability)\b/i.test(message));
  const otherChapter = OTHER_FM_CHAPTERS.find((chapter) => chapter.keywords.some((keyword) => {
    const needle = normalize(keyword);
    return needle && (' ' + normalized + ' ').includes(' ' + needle + ' ');
  }));
  if (!matched && !otherChapter) return null;

  const mode = getReplyMode(message);
  const language = input.language;
  if (!matched && otherChapter) {
    return {
      topicId: otherChapter.id,
      topicTitle: otherChapter.title,
      course: 'CA_INTERMEDIATE',
      paperCode: 'INT-G2-P6',
      section: 'Section A: Financial Management',
      chapterNumber: otherChapter.chapterNumber,
      syllabusApplicability: 'Official ICAI catalogue page headed Applicable for May 2026 Exam; later-attempt applicability must be rechecked',
      contentReviewStatus: 'AUTHOR_DRAFT_NOT_HUMAN_VERIFIED',
      benchmarkStatus: 'PROMPTS_DEFINED_NOT_EVALUATED',
      mode,
      answer: mode === 'example' ? otherChapter.examples[language]
        : mode === 'simpler' ? otherChapter.simpler[language]
          : mode === 'quiz' ? otherChapter.quizzes[language]
            : otherChapter.answers[language],
      source: {
        title: 'ICAI Intermediate Paper 6A — Financial Management, Chapter ' + otherChapter.chapterNumber + ' (official chapter catalogue)',
        url: ICAI_FM_SOURCE_URL,
        publisher: 'Institute of Chartered Accountants of India',
        sourceType: 'OFFICIAL_CHAPTER_CATALOGUE',
        note: 'Official chapter catalogue only. The explanation and numerical illustrations in PARAKH are original; ICAI study-material text is not reproduced here. Verify your exact attempt’s applicable material and RTP.',
      },
    };
  }
  return {
    topicId: RATIO_ANALYSIS.id,
    topicTitle: RATIO_ANALYSIS.title,
    course: 'CA_INTERMEDIATE',
    paperCode: 'INT-G2-P6',
    section: 'Section A: Financial Management',
    chapterNumber: 3,
    syllabusApplicability: 'Official ICAI catalogue page headed Applicable for May 2026 Exam; later-attempt applicability must be rechecked',
    contentReviewStatus: 'AUTHOR_DRAFT_NOT_HUMAN_VERIFIED',
    benchmarkStatus: 'PROMPTS_DEFINED_NOT_EVALUATED',
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
    ? '\n\nगुणवत्ता सूचना: यह PARAKH का original authored draft है और अभी qualified academic reviewer द्वारा independently review नहीं किया गया है। यह ICAI का reproduced text नहीं है। अपने exact attempt की applicable study material और RTP से final syllabus treatment verify करें।'
    : language === 'hinglish'
      ? '\n\nQuality note: ye PARAKH ka original authored draft hai; qualified academic reviewer ne abhi independently verify nahi kiya. Ye ICAI material ka copied text nahi. Apne exact attempt ki applicable study material aur RTP se final syllabus treatment verify kar.'
      : '\n\nQuality note: this is an original PARAKH authored draft; it has not yet been independently reviewed by a qualified academic reviewer and is not reproduced ICAI text. Verify final syllabus treatment against the study material and RTP applicable to your exact attempt.';
  return '**' + heading + ': ' + result.topicTitle + '**\n\n' + result.answer + nextStep + reviewNote;
}

export function getParakhChapterKnowledgeInventory(): {
  course: 'CA_INTERMEDIATE';
  paperCode: 'INT-G2-P6';
  paperTitle: 'Financial Management and Strategic Management';
  section: 'Section A: Financial Management';
  syllabusApplicability: string;
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
    syllabusApplicability: 'Official ICAI catalogue page headed Applicable for May 2026 Exam; later-attempt applicability must be rechecked',
    sourceCheckedAt: SOURCE_CHECKED_AT,
    sourceUrl: ICAI_FM_SOURCE_URL,
    chapterCount: FM_CHAPTERS.length,
    authoredContentCount: FM_CHAPTERS.filter((chapter) => chapter.contentStatus !== 'MAPPED_ONLY').length,
    humanReviewedContentCount: 0,
    benchmarkCaseCount: PARAKH_FM_RATIO_BENCHMARKS.length + OTHER_FM_BENCHMARKS.length,
    humanReviewedBenchmarkCount: 0,
    chapters: FM_CHAPTERS.map((chapter) => ({
      ...chapter,
      units: [...chapter.units],
    })),
    limitations: [
      'The map covers CA Intermediate Paper 6A only; it is not a complete CA Foundation, Intermediate, Final or SPOM knowledge bank.',
      'This rollout contains original draft content for all nine mapped Financial Management chapters, but none has been human-reviewed.',
      'No chapter content or benchmark has been marked human-reviewed. Deterministic tests do not certify full academic correctness.',
      'Attempt-sensitive changes and statutory updates must be checked against the exact ICAI material, RTP and updates for the student’s attempt.',
    ],
  };
}
