import type { StudyReplyLanguage } from './studyPlannerLanguageService.js';

export type StudyKnowledgeCourse = 'CA_FOUNDATION' | 'CA_INTERMEDIATE' | 'CA_FINAL' | string;
type KnowledgeTopic = {
  id: string;
  title: string;
  subjects: string[];
  keywords: string[];
  answers: Record<StudyReplyLanguage, string>;
  example: Record<StudyReplyLanguage, string>;
  simpler: Record<StudyReplyLanguage, string>;
  quiz: Record<StudyReplyLanguage, string>;
};

const TOPICS: KnowledgeTopic[] = [
  {
    id: 'active-recall', title: 'Active recall', subjects: [],
    keywords: ['active recall','remember','memorize','memory','retention','forget','yaad','bhool','recall','without notes','याद','याददाश्त','रटना'],
    answers: {
      english: 'Active recall means retrieving information from memory without looking at your notes. Read a small section, close the book, write or speak the key points, then check what you missed. Repeat only the weak parts.',
      hinglish: 'Active recall ka matlab hai notes dekhe bina information yaad se nikalna. Chhota section padh, book band kar, main points likh ya bol, phir notes se check kar ki kya miss hua. Sirf weak points dobara revise kar.',
      hindi: 'Active recall का अर्थ है notes देखे बिना जानकारी को याद से दोहराना। छोटा भाग पढ़ें, किताब बंद करें, मुख्य points लिखें या बोलें, फिर notes से जाँचें कि क्या छूटा। कमजोर हिस्सों को दोबारा revise करें।',
    },
    example: {
      english: 'Example: after studying the conditions of a law provision, close the book and list every condition from memory. Compare your list with the module and mark missing conditions.',
      hinglish: 'Example: kisi law provision ki conditions padhne ke baad book band kar aur saari conditions yaad se likh. Module se compare kar aur jo condition miss hui usko mark kar.',
      hindi: 'उदाहरण: किसी law provision की conditions पढ़ने के बाद किताब बंद करें और सभी conditions याद से लिखें। Module से मिलाएँ और छूटी हुई conditions को mark करें।',
    },
    simpler: {
      english: 'In simple words: do not just read and feel familiar. Close the book and test whether you can explain the topic yourself.',
      hinglish: 'Simple words mein: sirf padhkar familiar feel mat kar. Book band karke khud se explain karne ki koshish kar. Jo yaad nahi aaya wahi revise karna hai.',
      hindi: 'आसान भाषा में: केवल पढ़कर यह न मानें कि याद हो गया। किताब बंद करके खुद समझाने की कोशिश करें। जो याद न आए, उसी को दोबारा पढ़ें।',
    },
    quiz: {
      english: 'Quick self-test: after closing your notes, can you explain the topic in 60 seconds and list its key points? Try it now, then check your notes.',
      hinglish: 'Quick self-test: notes band karke kya tu topic ko 60 seconds mein explain kar sakta hai aur key points bata sakta hai? Abhi try kar, phir notes check kar.',
      hindi: 'छोटा self-test: notes बंद करके क्या आप topic को 60 seconds में समझा सकते हैं और उसके मुख्य points बता सकते हैं? अभी कोशिश करें, फिर notes जाँचें।',
    },
  },
  {
    id: 'spaced-revision', title: 'Spaced revision', subjects: [],
    keywords: ['spaced repetition','spaced revision','revision gap','revise again','1 day','3 day','7 day','forgetting','revision schedule'],
    answers: {
      english: 'Spaced revision means revisiting a topic at increasing intervals instead of repeating it many times in one sitting. A practical starting cycle is: same day, next day, after 3 days, after 7 days, then after 14 days. Adjust the gaps based on how much you remember.',
      hinglish: 'Spaced revision mein ek hi sitting mein baar-baar padhne ke bajay gap dekar topic revise karte hain. Starting cycle rakh: same day, next day, 3 din baad, 7 din baad aur phir 14 din baad. Recall weak ho toh gap chhota kar.',
      hindi: 'Spaced revision में एक ही बार में बार-बार पढ़ने के बजाय अंतराल देकर topic दोहराते हैं। शुरुआत के लिए same day, अगले दिन, 3 दिन बाद, 7 दिन बाद और फिर 14 दिन बाद revise करें। याद कम हो तो अंतराल घटाएँ।',
    },
    example: {
      english: 'Example: study a chapter on Monday, do a 10-minute recall on Tuesday, solve a few questions on Thursday, and take a short test the following Monday.',
      hinglish: 'Example: Monday ko chapter padh, Tuesday ko 10-minute recall kar, Thursday ko kuch questions solve kar aur next Monday short test de.',
      hindi: 'उदाहरण: सोमवार को chapter पढ़ें, मंगलवार को 10 मिनट recall करें, गुरुवार को कुछ questions solve करें और अगले सोमवार को छोटा test दें।',
    },
    simpler: {
      english: 'Simple idea: do not wait until the exam to reopen a chapter. Revisit it briefly after a gap, before you forget most of it.',
      hinglish: 'Simple baat: chapter ko exam ke time hi dobara mat khol. Bhoolne se pehle chhote gap ke baad usko phir se recall kar.',
      hindi: 'सीधी बात: chapter को दोबारा पढ़ने के लिए exam तक इंतज़ार न करें। बहुत कुछ भूलने से पहले थोड़े अंतराल पर उसे फिर याद करें।',
    },
    quiz: {
      english: 'Quick check: name the last three topics you studied. Which one have you not recalled since the first reading? Schedule a short recall for it today.',
      hinglish: 'Quick check: last 3 topics ke naam bata. Inmein se kis topic ko first reading ke baad recall nahi kiya? Uska 10-minute recall aaj schedule kar.',
      hindi: 'जाँचें: आपने हाल में कौन-से तीन topics पढ़े? किस topic को पहली reading के बाद recall नहीं किया? आज उसके लिए 10 मिनट रखें।',
    },
  },
  {
    id: 'numerical-practice', title: 'Numerical subject practice', subjects: ['Accounting','Quantitative Aptitude','Advanced Accounting','Cost and Management Accounting','Financial Management and Strategic Management'],
    keywords: ['numerical','practical question','calculation','sum','problem solving','accounting question','costing question','formula','working notes'],
    answers: {
      english: 'For numerical subjects, use a solve–check–redo loop: (1) understand what is asked, (2) identify the relevant concept or formula, (3) show clean workings, (4) compare with the solution, (5) redo the question later without looking. Keep a list of recurring error types.',
      hinglish: 'Numerical subjects ke liye solve–check–redo cycle use kar: (1) question kya maang raha hai samajh, (2) relevant concept/formula identify kar, (3) workings clearly dikha, (4) solution se compare kar, (5) baad mein bina dekhe dobara solve kar. Repeated mistakes ki list bana.',
      hindi: 'Numerical subjects के लिए solve–check–redo cycle अपनाएँ: (1) प्रश्न की requirement समझें, (2) सही concept/formula चुनें, (3) workings साफ दिखाएँ, (4) solution से तुलना करें, (5) बाद में बिना देखे फिर solve करें। बार-बार होने वाली गलतियों की सूची बनाएँ।',
    },
    example: {
      english: 'Example: if a costing problem goes wrong, identify whether the issue was formula selection, data extraction, arithmetic, or presentation. Redo the same problem after a day without viewing the answer.',
      hinglish: 'Example: costing ka sum galat hua toh check kar ki issue formula selection, data pick karne, calculation ya presentation mein tha. Ek din baad answer dekhe bina wahi sum dobara kar.',
      hindi: 'उदाहरण: costing का प्रश्न गलत हुआ तो देखें कि गलती formula चुनने, data लेने, calculation या presentation में थी। एक दिन बाद answer देखे बिना वही प्रश्न फिर हल करें।',
    },
    simpler: {
      english: 'Do not measure practice only by how many questions you attempted. Measure how many you can solve correctly later without help.',
      hinglish: 'Practice ko sirf attempted questions se mat naap. Ye dekh ki kitne questions baad mein bina help ke sahi solve kar pa raha hai.',
      hindi: 'Practice को केवल हल किए गए questions की संख्या से न मापें। यह देखें कि बाद में कितने questions बिना मदद के सही हल कर पाते हैं।',
    },
    quiz: {
      english: 'Quick check: can you solve one representative question from this chapter without seeing the formula or solution? If not, identify the exact step where you get stuck.',
      hinglish: 'Quick check: kya tu is chapter ka ek representative question formula ya solution dekhe bina solve kar sakta hai? Nahi toh exact step identify kar jahan atak raha hai.',
      hindi: 'जाँचें: क्या आप इस chapter का एक representative question formula या solution देखे बिना हल कर सकते हैं? नहीं, तो वह exact step पहचानें जहाँ कठिनाई आती है।',
    },
  },
  {
    id: 'law-tax-answer-writing', title: 'Law and Tax answer writing', subjects: ['Business Laws','Corporate and Other Laws','Taxation'],
    keywords: ['law answer','tax answer','provision','section','case study','legal answer','gst answer','income tax answer','answer writing','conclusion'],
    answers: {
      english: 'For Law/Tax descriptive answers, structure your response around: issue or requirement, applicable provision, application to the facts, and a clear conclusion. Use the wording and section references from the applicable ICAI study material. Do not rely on memory for current rates, limits or amendments.',
      hinglish: 'Law/Tax descriptive answer ko is structure mein likh: issue/requirement, applicable provision, facts par application aur clear conclusion. Applicable ICAI material se wording aur section reference verify kar. Current rates, limits ya amendments memory se mat likh.',
      hindi: 'Law/Tax के descriptive answer को इस क्रम में लिखें: issue/requirement, लागू provision, दिए गए facts पर उसका application और स्पष्ट conclusion। Applicable ICAI material से wording और section reference जाँचें। Current rates, limits या amendments केवल memory के आधार पर न लिखें।',
    },
    example: {
      english: 'Example layout: “Issue: … Provision: … Application: Given that …, the provision applies/does not apply because … Conclusion: …” Replace the placeholders with the exact facts and verified applicable provision.',
      hinglish: 'Example layout: “Issue: … Provision: … Application: Given facts ke according … Conclusion: …” Ismein question ke exact facts aur verified applicable provision use kar.',
      hindi: 'उदाहरण: “Issue: … Provision: … Application: दिए गए facts के अनुसार … Conclusion: …” खाली स्थानों में प्रश्न के exact facts और verified applicable provision लिखें।',
    },
    simpler: {
      english: 'In simple words: first state the rule, then connect it to the facts in the question, and finally write the result. Do not write a provision without applying it.',
      hinglish: 'Simple words mein: pehle rule likh, phir question ke facts se connect kar, aur end mein result likh. Sirf provision likhkar chhodna nahi.',
      hindi: 'आसान भाषा में: पहले rule लिखें, फिर उसे प्रश्न के facts से जोड़ें और अंत में result लिखें। केवल provision लिखकर न छोड़ें।',
    },
    quiz: {
      english: 'Quick practice: take one case-study question and underline (1) the issue, (2) facts relevant to the provision, and (3) the conclusion the question asks you to reach.',
      hinglish: 'Quick practice: ek case-study question le aur (1) issue, (2) provision se related facts, (3) required conclusion ko underline kar.',
      hindi: 'अभ्यास: एक case-study question लें और (1) issue, (2) provision से जुड़े facts, (3) अपेक्षित conclusion को underline करें।',
    },
  },
  {
    id: 'mock-analysis', title: 'Mock test analysis', subjects: [],
    keywords: ['mock test','test analysis','paper analysis','marks','score','mistakes','time management','paper attempt','exam hall','mock'],
    answers: {
      english: 'A mock is useful only when you analyse it. After each paper, classify every lost mark as: concept gap, incomplete coverage, calculation error, presentation issue, or time-management issue. Pick the two biggest causes and practise them before the next mock.',
      hinglish: 'Mock tabhi useful hai jab analysis kare. Paper ke baad har lost mark ko classify kar: concept gap, incomplete coverage, calculation error, presentation issue ya time management. Sabse bade 2 reasons choose kar aur next mock se pehle un par practice kar.',
      hindi: 'Mock तभी उपयोगी है जब उसका analysis करें। हर खोए हुए mark को इन कारणों में बाँटें: concept gap, अधूरी coverage, calculation error, presentation issue या time management। सबसे बड़े दो कारण चुनकर अगले mock से पहले उन पर अभ्यास करें।',
    },
    example: {
      english: 'Example: if you scored 48/100, do not only reread the whole syllabus. Check whether most lost marks came from two unprepared chapters, calculation slips or unanswered questions due to time.',
      hinglish: 'Example: 48/100 aaye toh poora syllabus blindly reread mat kar. Dekh marks mainly 2 unprepared chapters, calculation slips ya time ki wajah se chhoote questions se gaye.',
      hindi: 'उदाहरण: 48/100 आए तो पूरा syllabus बिना analysis के दोबारा न पढ़ें। देखें कि marks मुख्यतः दो कमजोर chapters, calculation की गलतियों या समय के कारण छूटे questions से गए।',
    },
    simpler: {
      english: 'Do not ask only “How many marks did I get?” Ask “Why did I lose each mark, and what will I change before the next test?”',
      hinglish: 'Sirf ye mat pooch “kitne marks aaye?” Ye pooch “har mark kahan gaya aur next test se pehle kya change karunga?”',
      hindi: 'केवल यह न पूछें कि कितने marks आए। यह पूछें कि हर mark कहाँ खोया और अगले test से पहले क्या बदलेंगे।',
    },
    quiz: {
      english: 'Quick review: name your biggest lost-mark category from the last mock. Write one specific action you will take before the next paper.',
      hinglish: 'Quick review: last mock mein sabse zyada marks kis reason se gaye? Next paper se pehle usko improve karne ka ek specific action likh.',
      hindi: 'जाँचें: पिछले mock में सबसे अधिक marks किस कारण से कटे? अगले paper से पहले सुधार के लिए एक ठोस action लिखें।',
    },
  },
  {
    id: 'study-session', title: 'Focused study sessions', subjects: [],
    keywords: ['focus','concentration','distraction','pomodoro','study session','study hours','break','procrastination','mobile','phone'],
    answers: {
      english: 'Make each session outcome-based. Before starting, write one task such as “solve 5 questions” or “recall 2 provisions”. Work for 25–50 minutes, take a short break, and record what was completed. Keep the phone out of reach during the block.',
      hinglish: 'Har study session ka clear output rakh. Start se pehle ek task likh, jaise “5 questions solve karne hain” ya “2 provisions recall karne hain”. 25–50 minutes focus se padh, short break le aur completed work note kar. Session mein phone door rakh.',
      hindi: 'हर study session का स्पष्ट outcome रखें। शुरू करने से पहले एक task लिखें, जैसे “5 questions solve करने हैं” या “2 provisions recall करने हैं”। 25–50 मिनट ध्यान से पढ़ें, छोटा break लें और पूरा किया गया काम note करें।',
    },
    example: {
      english: 'Example: 40 minutes to solve 4 questions, 5-minute break, then 15 minutes to check solutions and log mistakes. This is more measurable than writing “study costing for one hour”.',
      hinglish: 'Example: 40 minutes mein 4 questions solve, 5-minute break, phir 15 minutes solutions check aur mistakes note. Ye “1 hour costing padhna” se zyada measurable hai.',
      hindi: 'उदाहरण: 40 मिनट में 4 questions हल करें, 5 मिनट break लें, फिर 15 मिनट solutions जाँचकर गलतियाँ लिखें। यह “एक घंटा costing पढ़ना” से अधिक measurable है।',
    },
    simpler: {
      english: 'Start with one small task, remove distractions, work for a fixed block, then take a short break. Decide the next task before you stop.',
      hinglish: 'Ek chhota task choose kar, distraction hata, fixed time tak focus kar, phir short break le. Rukne se pehle next task decide kar.',
      hindi: 'एक छोटा task चुनें, distractions हटाएँ, तय समय तक ध्यान से काम करें और फिर छोटा break लें। रुकने से पहले अगला task तय करें।',
    },
    quiz: {
      english: 'Quick check: what is the one measurable output you will complete in your next 40-minute study block?',
      hinglish: 'Quick check: next 40-minute study block mein tu kaunsa ek measurable task complete karega?',
      hindi: 'जाँचें: अगले 40 मिनट के study block में आप कौन-सा एक measurable task पूरा करेंगे?',
    },
  },
  {
    id: 'revision-cycle', title: 'Chapter revision cycle', subjects: [],
    keywords: ['revision strategy','how to revise','revise chapter','revision method','chapter revision','prepare exam','padhai kaise','revision kaise'],
    answers: {
      english: 'Use a four-step chapter cycle: (1) quick overview of headings, (2) closed-book recall of key points, (3) solve selected questions, (4) update an error list and schedule the next recall. Spend more time on weak areas rather than rereading every page equally.',
      hinglish: 'Chapter ke liye 4-step cycle rakh: (1) headings ka quick overview, (2) notes band karke key points recall, (3) selected questions solve, (4) error list update karke next recall schedule. Har page ko equal time dene ke bajay weak areas par zyada focus kar.',
      hindi: 'Chapter के लिए चार steps अपनाएँ: (1) headings का quick overview, (2) notes बंद करके मुख्य points recall, (3) चुने हुए questions solve, (4) error list update करके अगला recall schedule। हर page को बराबर समय देने के बजाय कमजोर हिस्सों पर अधिक ध्यान दें।',
    },
    example: {
      english: 'Example for a 90-minute session: 10 minutes overview, 20 minutes recall, 45 minutes question practice, 15 minutes checking and error logging. Adjust the split to the chapter and your level.',
      hinglish: '90-minute session ka example: 10 min overview, 20 min recall, 45 min question practice, 15 min checking aur error log. Chapter aur apni preparation ke hisaab se split adjust kar.',
      hindi: '90 मिनट के session का उदाहरण: 10 मिनट overview, 20 मिनट recall, 45 मिनट question practice और 15 मिनट checking/error log। अपनी तैयारी के अनुसार समय बदलें।',
    },
    simpler: {
      english: 'First see what the chapter contains, then try to remember it without notes, practise questions, and record what you got wrong.',
      hinglish: 'Pehle chapter ka overview dekh, phir notes band karke yaad kar, questions laga aur jo galat hua usko note kar.',
      hindi: 'पहले chapter का overview देखें, फिर notes बंद करके याद करें, questions हल करें और गलतियों को note करें।',
    },
    quiz: {
      english: 'Quick check: can you list the chapter headings, explain its three most important ideas, and solve one standard question without notes?',
      hinglish: 'Quick check: kya tu chapter ki headings, 3 important concepts aur ek standard question bina notes ke kar sakta hai?',
      hindi: 'जाँचें: क्या आप chapter की headings, तीन महत्वपूर्ण concepts और एक standard question बिना notes के कर सकते हैं?',
    },
  },
];

const STOP_WORDS = new Set(['the','a','an','is','are','am','do','does','did','how','what','why','when','where','can','could','should','would','i','me','my','you','your','we','our','to','of','for','in','on','at','and','or','but','with','about','please','tell','explain','bhai','mujhe','kaise','kya','hai','hain','karu','karo','batao','btao','samjhao','mera','meri','mere','ko','ke','ka','ki','se','mein','main','nahi','nahin','hai','tha','thi','ho','raha','rahi','rhe','ek','aur','ye','yeh','woh','vo']);

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ').trim();
}

function terms(value: string): string[] {
  return normalize(value).split(' ').filter((term) => term.length > 1 && !STOP_WORDS.has(term));
}

function getMode(message: string): 'example' | 'simpler' | 'quiz' | 'answer' {
  const text = normalize(message);
  if (/\b(example|example do|udaharan|udharan|misal)\b/.test(text)) return 'example';
  if (/\b(simple|simpler|easy|easier|samajh nahi|samajh nhi|aasaan|asan|basic|again|dobara)\b/.test(text)) return 'simpler';
  if (/\b(quiz|test me|ask me|practice question|self test|question pucho)\b/.test(text)) return 'quiz';
  return 'answer';
}

function scoreTopic(topic: KnowledgeTopic, queryTerms: string[]): number {
  if (!queryTerms.length) return 0;
  const title = terms(topic.title);
  const keywords = topic.keywords.flatMap(terms);
  const subjectTerms = topic.subjects.flatMap(terms);
  const haystack = new Set([...title, ...keywords, ...subjectTerms]);
  let score = 0;
  for (const term of queryTerms) {
    if (title.includes(term)) score += 5;
    else if (subjectTerms.includes(term)) score += 4;
    else if (keywords.includes(term)) score += 3;
    else if ([...haystack].some((candidate) => candidate.startsWith(term) || term.startsWith(candidate))) score += 1;
  }
  const normalizedQuery = normalize(queryTerms.join(' '));
  if (normalize(topic.title) === normalizedQuery) score += 8;
  return score;
}

export interface StudyKnowledgeResult {
  topicId: string;
  topicTitle: string;
  answer: string;
  score: number;
  mode: 'answer' | 'example' | 'simpler' | 'quiz';
}

export function searchStudyKnowledge(input: {
  message: string;
  course: StudyKnowledgeCourse;
  history?: string[];
  language: StudyReplyLanguage;
}): StudyKnowledgeResult | null {
  const message = String(input.message || '').trim();
  if (!message) return null;
  // Do not answer attempt-sensitive or current statutory questions from generic study tips.
  if (/\b(current|latest|recent|amended|amendment|rate|rates|limit|limits|notification|finance act|assessment year|section\s+\d+)\b/i.test(message)) return null;

  const mode = getMode(message);
  const history = Array.isArray(input.history) ? input.history.slice(-6) : [];
  const isFollowUp = mode !== 'answer' || /^(and|also|then|more|continue|next|aur|phir|example|samjha|samajh nahi aaya|short mein|again)\b/i.test(normalize(message));
  const searchText = isFollowUp ? [message, ...history].join(' ') : message;
  const queryTerms = terms(searchText);
  const ranked = TOPICS.map((topic) => ({ topic, score: scoreTopic(topic, queryTerms) }))
    .sort((a, b) => b.score - a.score);
  const lastAssistantTopic = isFollowUp
    ? [...history].reverse().find((entry) => /^Planner:.*\bTopic:/i.test(entry))
    : undefined;
  const rememberedTopic = lastAssistantTopic
    ? TOPICS.find((topic) => normalize(lastAssistantTopic).includes(normalize(topic.title)))
    : undefined;
  const best = rememberedTopic
    ? { topic: rememberedTopic, score: Math.max(3, scoreTopic(rememberedTopic, queryTerms)) }
    : ranked[0];
  if (!best || best.score < 3) return null;
  if (best.topic.id === 'numerical-practice' && !/\b(practis|practice|solve|solving|sum|sums|numerical|calculation|calculations)\b/i.test(message)) return null;
  if (best.topic.id === 'law-tax-answer-writing' && !/\b(answer|write|writing|case study|case-based|presentation)\b/i.test(message)) return null;

  const course = input.course;
  const courseSubjectAliases: Record<string, string[]> = {
    CA_FOUNDATION: [
      'business laws', 'quantitative aptitude', 'business economics',
      'accounting', 'accounts', 'maths', 'mathematics', 'economics',
    ],
    CA_INTERMEDIATE: [
      'financial management and strategic management', 'corporate and other laws',
      'cost and management accounting', 'advanced accounting', 'auditing and ethics',
      'taxation', 'income tax', 'direct tax', 'indirect tax', 'gst',
      'costing', 'cost accounting', 'management accounting', 'corporate law',
      'company law', 'auditing', 'audit', 'financial management',
      'strategic management', 'accounting', 'accounts', 'fm-sm',
    ],
  };
  const courseSubjectNames: Record<string, string[]> = {
    CA_FOUNDATION: ['Accounting', 'Business Laws', 'Quantitative Aptitude', 'Business Economics'],
    CA_INTERMEDIATE: [
      'Advanced Accounting', 'Corporate and Other Laws', 'Taxation',
      'Cost and Management Accounting', 'Auditing and Ethics',
      'Financial Management and Strategic Management',
    ],
  };
  const normalizedMessage = normalize(message);
  const matchedAliases = Object.entries(courseSubjectAliases).flatMap(([matchedCourse, aliases]) =>
    aliases
      .filter((alias) => normalizedMessage.includes(normalize(alias)))
      .map((alias) => ({ course: matchedCourse, alias: normalize(alias) })),
  );
  // Prefer a full subject name over a shorter alias contained inside it:
  // "Advanced Accounting" must not also be treated as Foundation "Accounting".
  const explicitSubjectMatches = matchedAliases.filter((match) =>
    !matchedAliases.some((other) =>
      other.alias.length > match.alias.length && other.alias.includes(match.alias),
    ),
  );
  const hasWrongCourseSubject = explicitSubjectMatches.some((match) => match.course !== course);
  const topicSupportsCourse = (courseSubjectNames[course] || []).some((subject) =>
    best.topic.subjects.includes(subject),
  );
  const topicAllowed = !best.topic.subjects.length
    || (!hasWrongCourseSubject && (
      explicitSubjectMatches.length > 0
        ? explicitSubjectMatches.some((match) => match.course === course)
        : topicSupportsCourse
    ));
  if (!topicAllowed) return null;

  const answer = best.topic.answers[input.language];
  const response = mode === 'example' ? best.topic.example[input.language]
    : mode === 'simpler' ? best.topic.simpler[input.language]
      : mode === 'quiz' ? best.topic.quiz[input.language] : answer;
  return {
    topicId: best.topic.id,
    topicTitle: best.topic.title,
    answer,
    score: best.score,
    mode,
  };
}

export function buildKnowledgeChatReply(result: StudyKnowledgeResult, language: StudyReplyLanguage): string {
  const topic = TOPICS.find((item) => item.id === result.topicId);
  if (!topic) return result.answer;
  const answer = result.mode === 'example' ? topic.example[language]
    : result.mode === 'simpler' ? topic.simpler[language]
      : result.mode === 'quiz' ? topic.quiz[language]
        : topic.answers[language];
  const heading = language === 'hindi' ? 'विषय' : language === 'hinglish' ? 'Topic' : 'Topic';
  return '**' + heading + ': ' + topic.title + '**\n\n' + answer
    + (result.mode === 'quiz' ? '' : language === 'hindi'
      ? '\n\nअगला step: चाहें तो example या छोटा self-test माँगें।'
      : language === 'hinglish'
        ? '\n\nNext step: chahe toh example ya quick self-test maang le.'
        : '\n\nNext step: ask for an example or a quick self-test if useful.');
}
