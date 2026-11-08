import type { ParsedStudyPlannerRequest } from './studyPlannerEngine.js';

export type StudyReplyLanguage = 'english' | 'hinglish' | 'hindi';

const HINGLISH_MARKERS = /\b(bhai|batao|btao|kaise|kaisa|kaisi|karo|kru|karu|krna|karna|kr|krne|hai|hain|hoon|hu|ho|mujhe|mujhko|mujhse|mera|meri|mere|mein|kya|kyu|kyun|samjhao|samjha|samajh|padhai|padhu|padna|nahi|nahin|nhi|aata|ata|wala|wali|wale|accha|acha|bta|kri|kriya|kro|skte|sakte|sakta|sakti|chahiye|kitna|kitne|ghante|laane|lana|yaad|bhool|banao|bana|karunga|karungi|raha|rahi|rhe|pehle|liye|namaste|namaskar|shukriya|dhanyawad|gaya|gayi|thak)\b/i;

export function detectStudyReplyLanguage(text: string, history: string[] = []): StudyReplyLanguage {
  const value = String(text || '').trim();
  if (/[\u0900-\u097F]/.test(value)) return 'hindi';
  if (/^(?:fm|sm|fm[-&/]sm|gst|tax|taxation|law|audit|costing|accounting)\s+me[?.!]*$/i.test(value)) return 'hinglish';
  if (HINGLISH_MARKERS.test(value)) return 'hinglish';

  // Generic action chips inherit the student's recent language when their wording is English.
  const contextualTopicAction = /^(?:explain|teach|show me|walk me through)\s+(?:(?:a|an|the|this|that)\s+)?(?:(?:fm|financial management|sm|strategic management)\s+)?(?:concept|topic|chapter)\b/i.test(value);
  if (contextualTopicAction) {
    for (const prior of [...history].slice(-6).reverse()) {
      if (/[\u0900-\u097F]/.test(prior)) return 'hindi';
      if (HINGLISH_MARKERS.test(prior)) return 'hinglish';
    }
  }
  return 'english';
}


/** Recognise a standalone greeting or a nudge asking the assistant to greet back. */
export function isSocialGreeting(text: string): boolean {
  const value = String(text || '').trim();
  if (!value) return false;
  const plainGreeting = /^(?:hi+|hello+|hey+|hlo+|namaste|namaskar|नमस्ते|नमस्कार|good\s+morning|good\s+afternoon|good\s+evening)(?:[\s,]+(?:bhai|parakh|there|friend))?[\s.!?]*$/i;
  const greetingNudge = /\b(?:hello|hi|hey|hlo)\b.{0,55}\b(?:nahi|nahin|bolo|bologe|reply|greet|jawab)\b/i;
  return plainGreeting.test(value) || greetingNudge.test(value);
}

export function buildSocialGreetingReply(language: StudyReplyLanguage): string {
  if (language === 'hindi') {
    return 'नमस्ते! 😊 कैसे हैं आप? पढ़ाई हो या कोई और बात, अपने शब्दों में बताइए—हम आराम से बात आगे बढ़ाएँगे।';
  }
  if (language === 'hinglish') {
    return 'Arre hello bhai! 😄 Kaisa chal raha hai? Padhai ho ya koi aur baat, apne words mein bata—main conversation ko naturally aage badhaunga.';
  }
  return 'Hello! I’m PARAKH, your CA learning companion. How are you doing? We can talk naturally—about studies or anything else on your mind.';
}

export function buildSocialConversationReply(text: string, language: StudyReplyLanguage): string | null {
  const value = String(text || '').trim();
  if (!value) return null;
  if (isSocialGreeting(value)) return buildSocialGreetingReply(language);

  if (/^(?:how are you|how's it going|how are things|what's up)[?.! ]*$/i.test(value)
    || /\b(?:kaise ho|kaisa hai|kya haal(?: hai)?|sab kaise chal raha)\b/i.test(value)) {
    if (language === 'hindi') return 'मैं बढ़िया हूँ, धन्यवाद! 😊 आप बताइए, सब कैसा चल रहा है? पढ़ाई हो या कोई और बात, आराम से बताइए।';
    if (language === 'hinglish') return 'Main badhiya hoon bhai! 😄 Tu bata, sab kaisa chal raha hai? Padhai ho ya koi aur baat, aaram se bol.';
    return 'I’m doing well, thanks for asking! How are things with you? We can talk about studies or anything else on your mind.';
  }

  if (/^(?:thanks|thank you|thankyou|thx|shukriya|dhanyavaad|धन्यवाद|शुक्रिया)(?:\s+bhai)?[!. ]*$/i.test(value)) {
    if (language === 'hindi') return 'खुशी हुई मदद करके! जब भी कोई doubt हो या किसी topic को आगे समझना हो, यहीं से जारी रखेंगे।';
    if (language === 'hinglish') return 'Arey anytime bhai! 😄 Koi bhi doubt ho ya topic aage continue karna ho, bas message kar dena.';
    return 'You’re welcome! Whenever you want to continue or work through another question, just send it here.';
  }

  if (/^(?:bye|goodbye|see you|good night|gn|milte hain|chalta hoon|चलता हूँ|अलविदा)[!. ]*$/i.test(value)) {
    if (language === 'hindi') return 'ठीक है, फिर मिलते हैं! अपना ध्यान रखिए। जब वापस आएँगे, बातचीत यहीं से आगे बढ़ा लेंगे।';
    if (language === 'hinglish') return 'Theek hai bhai, milte hain! Apna dhyan rakhna. Jab wapas aayega, yahin se continue kar lenge.';
    return 'Take care! See you next time. We can pick up the conversation from here whenever you return.';
  }

  if (/^(?:what can you do|how can you help|what do you do|what is your role|tum kya kar sakte ho|aap kya kar sakte hain|kya kar sakte ho|kaise help karoge)[?.! ]*$/i.test(value)) {
    if (language === 'hindi') return 'मैं CA concepts, numericals, chapters, revision, exam strategy और study planning में मदद कर सकता हूँ। अपना सवाल जैसे मन में आए वैसे लिखिए—कोई fixed format या menu चुनने की जरूरत नहीं।';
    if (language === 'hinglish') return 'Bhai, main CA concepts, numericals, chapters, revision, exam strategy aur study planning mein help kar sakta hoon. Apna doubt jaise mann mein aaye waise likh—koi fixed format ya menu choose karne ki zaroorat nahi.';
    return 'I can help with CA concepts, numericals, chapters, revision, exam strategy and study planning. Ask in your own words—there is no fixed format or menu you need to follow.';
  }

  if (/^(?:who are you|what is your name|tumhara naam kya hai|aap kaun ho)[?.! ]*$/i.test(value)) {
    if (language === 'hindi') return 'मैं PARAKH हूँ—आपका CA learning companion. मेरा काम concepts समझने, doubts सुलझाने और पढ़ाई की planning में मदद करना है।';
    if (language === 'hinglish') return 'Main PARAKH hoon bhai—tera CA learning companion. Concepts samjhana, doubts solve karna aur padhai plan karne mein help karta hoon.';
    return 'I’m PARAKH, your CA learning companion. I’m here to help you understand concepts, work through doubts and plan your preparation.';
  }

  if (/^(?:i am fine|i'm fine|i am good|i'm good|doing good|all good|main thik hoon|main theek hoon|mai thik hu|badhiya|mast hoon|सब ठीक है|मैं ठीक हूँ)[!. ]*$/i.test(value)) {
    if (language === 'hindi') return 'अच्छा लगा सुनकर! 😊 आज कुछ पढ़ने का मन है या बस थोड़ी बातचीत करनी है?';
    if (language === 'hinglish') return 'Badhiya bhai! 😄 Aaj kuch padhne ka mood hai ya bas thodi baat-cheet karni hai?';
    return 'Good to hear! 😊 Are you in the mood to study something today, or just have a quick chat?';
  }

  if (/\b(?:i am|i'm)\s+(?:tired|stressed|bored|upset|sad|overwhelmed)\b/i.test(value)
    || /\b(?:thak gaya|thak gayi|bore ho raha|bore ho rahi|tension hai|stress ho raha|stress ho rahi|mood off|man nahi lag raha)\b/i.test(value)) {
    if (language === 'hindi') return 'समझ सकता हूँ—कभी-कभी break लेना भी जरूरी होता है। थोड़ा आराम कर लीजिए। अगर पढ़ाई का pressure है, तो उसे छोटे steps में बाँटकर साथ में संभाल सकते हैं; और अगर बस बात करनी है, वह भी ठीक है।';
    if (language === 'hinglish') return 'Samajh raha hoon bhai—kabhi-kabhi break lena bhi zaroori hota hai. Thoda relax kar. Agar padhai ka pressure hai toh use chhote steps mein tod lenge; aur bas baat karni hai toh woh bhi theek hai.';
    return 'That sounds tiring. It is okay to take a short break. If study pressure is behind it, we can break the work into smaller steps; or we can simply talk for a bit.';
  }

  return null;
}

export function buildTopicIntentClarification(language: StudyReplyLanguage, subject: string): string {
  if (language === 'hindi') {
    return subject + ' में जरूर मदद करूँगा। जिस concept, formula, numerical या chapter में दिक्कत है, अपने शब्दों में बताइए या सवाल भेजिए। वहीं से शुरू करते हैं।';
  }
  if (language === 'hinglish') {
    return 'Haan bhai, ' + subject + ' mein bilkul help karunga. Concept, formula, numerical ya chapter—jo bhi dikkat hai apne words mein bata ya direct question bhej de. Wahi se shuru karte hain.';
  }
  return 'I can help with ' + subject + '. Tell me what is confusing you, or paste a question and we’ll work through it step by step.';
}

export function buildTopicIntentOptions(language: StudyReplyLanguage, subject: string): string[] {
  if (language === 'hindi') return [subject + ' का concept समझाओ', subject + ' की revision strategy', subject + ' का study plan'];
  if (language === 'hinglish') return [subject + ' ka concept samjhao', subject + ' ki revision strategy batao', subject + ' ka study plan banao'];
  return ['Explain a ' + subject + ' concept', subject + ' revision strategy', subject + ' study plan'];
}

export function isGeneralStudyQuestion(text: string): boolean {
  const learningDifficulty = /\b(?:mujhe|mujhko|mujhse|i)\b.{0,80}\b(?:nahi|nahin|nhi|don't|do not|cannot|can't|cant|unable|struggling)\b.{0,80}\b(?:aata|ata|samajh|understand|chapter|topic|ratio|formula|concept)\b/i.test(text)
    || /\b(?:nahi|nahin|nhi)\s+(?:aata|ata|samajh(?:h)?\s+(?:aa\s+)?(?:raha|rahi)|samajh)\b/i.test(text)
    || /\bsamajh\s+(?:nahi|nahin|nhi)\s+(?:aa\s+)?(?:raha|rahi|aata|ata)\b/i.test(text)
    || /\b(?:hard|difficult|struggling)\s+(?:with|in|to understand)\b/i.test(text);
  if (learningDifficulty) return true;
  if (/[\u0900-\u097F]/.test(text) && /(कैसे|क्या|पढ़|revision|समझ|बताइ|करूँ|करें|मदद|सवाल|डाउट|उलझ|समस्या)/i.test(text)) return true;
  return /\b(how\s+(?:can|do|should|to)\s+i|how\s+to|explain(?:ed)?|explain\s+me|what\s+(?:is|are)|tell\s+me\s+about|define|describe|difference\s+between|compare|why\s+(?:does|is|are|do)|meaning\s+of|concept\s+of|help\s+me\s+understand|i(?:'m|\s+am)\s+(?:confused|stuck|struggling)|i\s+(?:don't|do\s+not)\s+understand|i\s+have\s+(?:a\s+)?(?:doubt|question)|confused\s+about|stuck\s+on|struggling\s+with|doubt\s+about|effective|strategy|strategies|tips|improve|remember|memorize|study\s+method|revision\s+method|revision\s+strategy|prepare\s+for|exam\s+strategy|batao|btao|kaise|samjhao|samjha[o]?|kya\s+hai|kyu|kyun|kaise\s+kar|kaise\s+kru|kaise\s+karu|kaise\s+kri|kaise\s+karun|kaise\s+kare|revision\s+kaise\s+(?:kru|karu|kri|karun)|effective\s+revision|revision\s+kaise|padhai\s+kaise|yaad\s+kaise|samajh\s+kaise)\b/i.test(text);
}
export function buildGeneralStudyAnswer(
  message: string,
  parsed: ParsedStudyPlannerRequest,
): { language: StudyReplyLanguage; answer: string } {
  const language = detectStudyReplyLanguage(message);
  const subject = parsed.subjects[0] || '';
  const isLearningDifficulty = /\b(?:mujhe|mujhko|mujhse)\b.{0,80}\b(?:nahi|nahin|nhi)\b.{0,40}\b(?:aata|ata|samajh|chapter|topic)\b|\bsamajh\s+(?:nahi|nahin|nhi)\s+(?:aa\s+)?(?:raha|rahi|aata|ata)\b|\b(?:i don['’]?t know|i can['’]?t understand|not getting|struggling with|hard to understand)\b/i.test(message);
  const isRevision = /revision|revise|repeat|recall|yaad|padhai|study|prepare|preparation|exam/i.test(message);
  const isMemoryQuestion = /remember|memorize|memory|retention|forget|yaad|bhool|retain/i.test(message);
  const isExamStrategyQuestion = /mock|paper|attempt|marks?|score|time management|exam hall|exam strategy|answer presentation|paper solving/i.test(message);
  const isConceptQuestion = /what is|what are|explain|define|meaning of|difference between|compare|why does|why is|how does|concept of|kya hai|samjhao/i.test(message);
  const subjectLabel = subject ? subject : (language === 'english' ? 'your subject' : language === 'hindi' ? 'अपने subject' : 'apne subject');

  if (language === 'hindi') {
    const answer = isLearningDifficulty
      ? `कोई बात नहीं। जिस chapter में दिक्कत आ रही है, उसे बिल्कुल basic से step-by-step समझते हैं। पहले उसका core idea, फिर एक solved example और फिर एक छोटा practice question करेंगे। Chapter या exact question भेजिए; हम वहीं से शुरू करेंगे।`
      : isRevision
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
    const answer = isLearningDifficulty
      ? `Koi baat nahi bhai. Jis chapter mein dikkat aa rahi hai, use bilkul basic se step-by-step karte hain. Pehle core idea samjhenge, phir ek solved example aur uske baad ek chhota practice question. Chapter ya exact question bhej—wahi se start karte hain.`
      : isRevision
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

  const answer = isLearningDifficulty
    ? `No problem. We can build this chapter from the basics: first understand the core idea, then work through one solved example, and finally try a short practice question. Share the exact chapter or question and we will start there.`
    : isRevision
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


export function buildChapterAssessmentPrompt(language: StudyReplyLanguage, subject: string): string {
  if (language === 'hindi') {
    return subject + ' के लिए पहले सूचीबद्ध हर chapter की strength चुनें। मैं ratings का अनुमान नहीं लगाऊँगा। उपलब्ध revision time भी चुनें; फिर मैं chapter-wise plan बनाऊँगा।';
  }
  if (language === 'hinglish') {
    return 'Bhai, ' + subject + ' ke liye pehle listed har chapter ki strength select kar. Main ratings guess nahi karunga. Available revision time bhi choose kar; phir chapter-wise plan bana dunga.';
  }
  return 'For ' + subject + ', select a strength rating for each listed chapter. I will not guess your ratings. Also choose your available revision time, and I will build a chapter-wise plan.';
}

export function buildChapterAssessmentReadyMessage(language: StudyReplyLanguage, subject: string): string {
  if (language === 'hindi') {
    return subject + ' का chapter-wise revision plan तैयार है। कमजोर chapters को अधिक समय दिया गया है और आपकी ratings planner profile में save हो गई हैं।';
  }
  if (language === 'hinglish') {
    return 'Bhai, ' + subject + ' ka chapter-wise revision plan ready hai. Weak chapters ko zyada time diya hai, aur ratings tumhare planner profile mein save ho gayi hain.';
  }
  return 'Your ' + subject + ' chapter-wise revision plan is ready. Weak chapters have been allocated more time, and your ratings have been saved to your planner profile.';
}

export function buildIntermediateSMClarification(language: StudyReplyLanguage): string {
  if (language === 'hindi') {
    return 'SM / FM-SM समझ गया। किस हिस्से में दिक्कत आ रही है? कोई concept, framework या exam answer—अपने शब्दों में बताइए या सवाल भेजिए, वहीं से शुरू करेंगे।';
  }
  if (language === 'hinglish') {
    return 'SM / FM-SM samajh gaya bhai. Kis part mein dikkat aa rahi hai? Concept, framework ya exam answer—apne words mein bata ya question bhej de, wahi se shuru karte hain.';
  }
  return 'I understand you mean Strategic Management (SM) / FM-SM. Which part is giving you trouble? Describe the concept, framework or exam question in your own words and we’ll start there.';
}

export function buildPlanScopeOptions(language: StudyReplyLanguage): string[] {
  if (language === 'hindi') return ['सिर्फ एक दिन का revision plan', 'Exam तक roadmap + weekly timetable'];
  if (language === 'hinglish') return ['Sirf ek din ka revision plan', 'Exam tak roadmap + weekly timetable'];
  return ['One-day revision plan', 'Full exam roadmap + weekly timetable until exam'];
}
