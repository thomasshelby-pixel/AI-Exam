import type { ParsedStudyPlannerRequest } from './studyPlannerEngine.js';

export type StudyReplyLanguage = 'english' | 'hinglish' | 'hindi';

const HINGLISH_MARKERS = /\b(bhai|batao|btao|kaise|kaisa|kaisi|karo|kru|karu|krna|karna|hai|hain|hoon|hu|mujhe|mera|meri|mere|mein|main|kya|kyu|kyun|samjhao|samjha|padhai|padhu|padna|revision|ka|ki|ke|nahi|nahin|accha|acha|bta|btao|kri|kriya|kro|chahiye|kitna|kitne|ghante|marks|laane|lana)\b/i;

export function detectStudyReplyLanguage(text: string): StudyReplyLanguage {
  if (/[\u0900-\u097F]/.test(text)) return 'hindi';
  if (HINGLISH_MARKERS.test(text)) return 'hinglish';
  return 'english';
}

export function isGeneralStudyQuestion(text: string): boolean {
  if (/[\u0900-\u097F]/.test(text) && /(कैसे|क्या|पढ़|revision|समझ|बताइ|करूँ|करें)/i.test(text)) return true;
  return /\b(how\s+(?:can|do|should|to)\s+i|how\s+to|explain(?:ed)?|explain\s+me|what\s+(?:is|are)|tell\s+me\s+about|define|describe|difference\s+between|compare|why\s+(?:does|is|are|do)|meaning\s+of|concept\s+of|help\s+me\s+understand|effective|strategy|strategies|tips|improve|remember|memorize|study\s+method|revision\s+method|revision\s+strategy|prepare\s+for|exam\s+strategy|batao|btao|kaise|samjhao|samjha[o]?|kya\s+hai|kyu|kyun|kaise\s+kar|kaise\s+kru|kaise\s+karu|effective\s+revision|revision\s+kaise|padhai\s+kaise|yaad\s+kaise|samajh\s+kaise)\b/i.test(text);
}

export function buildGeneralStudyAnswer(
  message: string,
  parsed: ParsedStudyPlannerRequest,
): { language: StudyReplyLanguage; answer: string } {
  const language = detectStudyReplyLanguage(message);
  const subject = parsed.subjects[0] || '';
  const isRevision = /revision|revise|repeat|recall|yaad|padhai|study|prepare|preparation|exam/i.test(message);
  const isMemoryQuestion = /remember|memorize|memory|retention|forget|yaad|bhool|retain/i.test(message);
  const isExamStrategyQuestion = /mock|paper|attempt|marks?|score|time management|exam hall|exam strategy|answer presentation|paper solving/i.test(message);
  const isConceptQuestion = /what is|what are|explain|define|meaning of|difference between|compare|why does|why is|how does|concept of|kya hai|samjhao/i.test(message);
  const subjectLabel = subject ? subject : (language === 'english' ? 'your subject' : language === 'hindi' ? 'अपने subject' : 'apne subject');

  if (language === 'hindi') {
    const answer = isRevision
      ? `प्रभावी revision के लिए ${subjectLabel} को इस तरह पढ़ो:\n\n1. **Active recall:** Notes बंद करके मुख्य concepts, provisions या formulas याद से लिखो।\n2. **Question practice:** ICAI module के questions पहले खुद solve करो, फिर suggested answer से compare करो।\n3. **Error log:** गलतियों को concept, presentation और calculation में बाँटो।\n4. **Spaced revision:** आज पढ़ने के बाद 1 दिन, 3 दिन और 7 दिन बाद दोबारा recall करो।\n5. **Self-test:** Session के आखिरी 10–15 मिनट बिना notes देखे test दो।\n\nSubject या chapter का नाम बताओ, तो मैं उसी के हिसाब से specific strategy दूँगा।`
      : isMemoryQuestion
        ? `याद रखने के लिए छोटे topics बनाओ, बिना notes देखे recall करो, और उसी topic को 1, 3 और 7 दिन बाद दोहराओ। केवल पढ़ने के बजाय short self-test और गलतियों की सूची बनाओ।`
        : isExamStrategyQuestion
          ? `Exam strategy: पहले paper scan करो, marks के हिसाब से time बाँटो, हर answer में working/keywords साफ रखो, और आखिरी 10 मिनट review के लिए बचाओ। Mock के बाद गलतियों को concept, presentation और time-management में बाँटो।`
          : isConceptQuestion
            ? `इस topic का exam-oriented answer ऐसे बनाओ: definition/rule, applicability या conditions, exceptions, छोटा example और clear conclusion. Tax/Law में provision के exact words और applicability verify करो; numerical subjects में formula, workings और final answer दिखाओ। अगर exact question paste करोगे तो मैं उसी पर focused explanation दूँगा।`
            : `मैं CA study questions, concepts, revision methods, practice strategy और exam preparation में मदद कर सकता हूँ। Topic या exact question भेजो; मैं उसे steps, examples और exam-oriented points में तोड़कर समझाऊँगा।`;
    return { language, answer };
  }

  if (language === 'hinglish') {
    const answer = isRevision
      ? `Bhai, ${subjectLabel} ki effective revision aise kar:\n\n1. **Active recall:** Notes band karke main concepts, provisions ya formulas khud yaad se likh.\n2. **Question practice:** ICAI module ke questions pehle khud solve kar, phir suggested answer se compare kar.\n3. **Error log:** Har galti ko concept, presentation ya calculation mistake mein mark kar.\n4. **Spaced revision:** Aaj revise karne ke baad 1 din, 3 din aur 7 din baad quick recall kar.\n5. **Self-test:** Session ke last 10–15 min bina notes dekhe test de.\n\nSubject/chapter bata de toh main uske according exact revision approach bhi bata dunga.`
      : isMemoryQuestion
        ? `Bhai, yaad rakhne ke liye topic ko chhote parts mein tod, notes band karke recall kar, aur 1, 3, 7 din baad spaced revision kar. Har session mein ek short self-test aur error log rakh.`
        : isExamStrategyQuestion
          ? `Bhai, exam strategy: pehle paper scan kar, marks ke hisaab se time allocate kar, answers ki working/keywords clear rakh aur last 10 minute review ke liye bacha. Mock ke baad mistakes ko concept, presentation aur time-management mein divide kar.`
          : isConceptQuestion
            ? `Bhai, exam-oriented explanation mein rule/definition, applicability, conditions, exceptions, ek chhota example aur conclusion cover kar. Tax/Law mein provision ki exact wording verify kar; numerical subject mein formula aur workings dikha. Exact question paste kar de toh main usi par focused walkthrough kar dunga.`
            : `Haan bhai, main CA study-related doubts, concepts, revision methods, question practice aur exam preparation mein help karunga. Topic ya exact question ko steps, examples aur exam-oriented points mein break karenge.`;
    return { language, answer };
  }

  const answer = isRevision
    ? `For effective revision of ${subjectLabel}, use this cycle:\n\n1. **Active recall:** Close your notes and write the key concepts, provisions or formulas from memory.\n2. **Question practice:** Attempt ICAI module questions before checking the suggested answer.\n3. **Error log:** Classify mistakes as concept, presentation or calculation errors.\n4. **Spaced revision:** Revisit the topic after 1 day, 3 days and 7 days.\n5. **Self-test:** Finish with a 10–15 minute closed-book test.\n\nShare the subject/chapter or an exact question and I can tailor the explanation to it.`
    : isMemoryQuestion
      ? `For retention, break the chapter into small units, practise closed-book recall, then revisit it after 1, 3 and 7 days. Use a short self-test and an error log instead of rereading alone.`
      : isExamStrategyQuestion
        ? `For exam execution, scan the paper first, allocate time by marks, show clear workings and keywords, and reserve the final 10 minutes for review. After a mock, classify errors as concept, presentation or time-management issues.`
        : isConceptQuestion
          ? `A strong exam-oriented explanation should cover the rule or definition, applicability, conditions, exceptions, a short example and a clear conclusion. Verify exact statutory wording for Law/Tax and show formula and workings for numerical subjects. Paste the exact question for a focused walkthrough.`
          : `I can help with CA study questions, concepts, revision methods, question practice and exam preparation. I’ll structure the explanation into steps, examples and exam-oriented points rather than ask for timetable details unless you request a plan.`;
  return { language, answer };
}
