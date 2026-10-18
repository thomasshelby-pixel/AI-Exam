import type { ParsedStudyPlannerRequest } from './studyPlannerEngine.js';

export type StudyReplyLanguage = 'english' | 'hinglish' | 'hindi';

const HINGLISH_MARKERS = /\b(bhai|batao|btao|kaise|kaisa|kaisi|karo|kru|karu|krna|karna|hai|hain|hoon|hu|mujhe|mera|meri|mere|mein|main|kya|kyu|kyun|samjhao|samjha|padhai|padhu|padna|revision|ka|ki|ke|nahi|nahin|accha|acha|bta|btao|kri|kriya|kro|chahiye|kitna|kitne|ghante|marks|laane|lana)\b/i;

export function detectStudyReplyLanguage(text: string): StudyReplyLanguage {
  if (/[\u0900-\u097F]/.test(text)) return 'hindi';
  if (HINGLISH_MARKERS.test(text)) return 'hinglish';
  return 'english';
}

export function isGeneralStudyQuestion(text: string): boolean {
  return /\b(how\s+(?:can|do|should|to)\s+i|how\s+to|explain|explain\s+me|what\s+is|why\s+does|meaning\s+of|help\s+me\s+understand|effective|strategy|strategies|tips|improve|remember|memorize|study\s+method|revision\s+method|revision\s+strategy|prepare\s+for|exam\s+strategy|batao|btao|kaise|samjhao|samjha[o]?|kya\s+hai|kyu|kyun|kaise\s+kar|kaise\s+kru|kaise\s+karu|effective\s+revision|revision\s+kaise|padhai\s+kaise|yaad\s+kaise|samajh\s+kaise)\b/i.test(text);
}

export function buildGeneralStudyAnswer(
  message: string,
  parsed: ParsedStudyPlannerRequest,
): { language: StudyReplyLanguage; answer: string } {
  const language = detectStudyReplyLanguage(message);
  const subject = parsed.subjects[0] || '';
  const isRevision = /revision|revise|repeat|recall|yaad|padhai|study|prepare|preparation|exam/i.test(message);
  const subjectLabel = subject ? subject : (language === 'english' ? 'your subject' : language === 'hindi' ? 'अपने subject' : 'apne subject');

  if (language === 'hindi') {
    const answer = isRevision
      ? `Effective revision ke liye ${subjectLabel} ko is tarah padho:\n\n1. **Active recall:** Notes band karke main concepts, provisions ya formulas yaad se likho.\n2. **Question practice:** ICAI module ke questions pehle khud solve karo; phir suggested answer se compare karo.\n3. **Error log:** Galtiyon ko concept, presentation aur calculation mein divide karo.\n4. **Spaced revision:** Aaj padhne ke baad 1 din, 3 din aur 7 din baad short recall karo.\n5. **Self-test:** Session ke end mein 10–15 minute bina notes ke test do.\n\nAgar tum subject ya chapter ka naam bataoge, main uske hisaab se steps aur specific bana dunga.`
      : `Main tumhari CA study mein help kar sakta hoon. Topic ka naam ya exact question bhejo; main concept ko simple steps, example aur exam-oriented points mein samjhaunga. Agar tum revision plan chahte ho, subject/chapter aur available time batao.`;
    return { language, answer };
  }

  if (language === 'hinglish') {
    const answer = isRevision
      ? `Bhai, ${subjectLabel} ki effective revision aise kar:\n\n1. **Active recall:** Notes band karke main concepts, provisions ya formulas khud yaad se likh.\n2. **Question practice:** ICAI module ke questions pehle khud solve kar, phir suggested answer se compare kar.\n3. **Error log:** Har galti ko concept, presentation ya calculation mistake mein mark kar.\n4. **Spaced revision:** Aaj revise karne ke baad 1 din, 3 din aur 7 din baad quick recall kar.\n5. **Self-test:** Session ke last 10–15 min bina notes dekhe test de.\n\nSubject/chapter bata de toh main uske according exact revision approach bhi bata dunga.`
      : `Haan bhai, main CA study-related doubts, concepts, revision methods, question practice aur exam preparation mein help karunga. Topic ya exact question bhej; main simple Hinglish mein step-by-step samjhaunga. Agar timetable chahiye toh available time bhi bata dena.`;
    return { language, answer };
  }

  const answer = isRevision
    ? `For effective revision of ${subjectLabel}, use this cycle:\n\n1. **Active recall:** Close your notes and write the key concepts, provisions or formulas from memory.\n2. **Question practice:** Attempt ICAI module questions before checking the suggested answer.\n3. **Error log:** Classify mistakes as concept, presentation or calculation errors.\n4. **Spaced revision:** Revisit the topic after 1 day, 3 days and 7 days.\n5. **Self-test:** Finish with a 10–15 minute closed-book test.\n\nShare the subject/chapter or an exact question and I can tailor the explanation to it.`
    : `I can help with CA study questions, concepts, revision methods, question practice and exam preparation. Send the topic or exact question and I’ll explain it step by step with exam-oriented points. For a timetable, include your available study time.`;
  return { language, answer };
}
