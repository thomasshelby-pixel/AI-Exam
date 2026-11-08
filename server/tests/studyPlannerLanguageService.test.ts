import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChapterAssessmentPrompt, buildChapterAssessmentReadyMessage, buildGeneralStudyAnswer, buildIntermediateSMClarification, buildPlanScopeOptions, buildSocialGreetingReply, buildTopicIntentClarification, buildTopicIntentOptions, detectStudyReplyLanguage, isGeneralStudyQuestion, isSocialGreeting } from '../services/studyPlannerLanguageService.js';
import { parseStudyPlannerRequest } from '../services/studyPlannerEngine.js';

test('detects Hinglish, Hindi script, and English independently', () => {
  assert.equal(detectStudyReplyLanguage('Bhai revision kaise karu?'), 'hinglish');
  assert.equal(detectStudyReplyLanguage('रिवीजन कैसे करूँ?'), 'hindi');
  assert.equal(detectStudyReplyLanguage('How should I revise GST?'), 'english');
});

test('recognises Hinglish study advice as a question, not a missing timetable form', () => {
  assert.equal(isGeneralStudyQuestion('Btao mainst ka effective revision kaise kri'), true);
  assert.equal(isGeneralStudyQuestion('How can I revise effectively?'), true);
  assert.equal(isGeneralStudyQuestion('प्रभावी revision कैसे करूँ?'), true);
});

test('gives effective revision advice in the same language style as the student', () => {
  const parsed = parseStudyPlannerRequest('Btao mainst ka effective revision kaise kri', 'CA_INTERMEDIATE');
  const hinglish = buildGeneralStudyAnswer('Btao mainst ka effective revision kaise kri', parsed);
  assert.equal(hinglish.language, 'hinglish');
  assert.match(hinglish.answer, /Bhai/);
  assert.match(hinglish.answer, /Active recall/);
  assert.match(hinglish.answer, /Question practice/);

  const hindi = buildGeneralStudyAnswer('प्रभावी revision कैसे करूँ?', parsed);
  assert.equal(hindi.language, 'hindi');
  assert.match(hindi.answer, /प्रभावी revision/);
  assert.match(hindi.answer, /गलतियों/);

  const english = buildGeneralStudyAnswer('How can I revise effectively?', parsed);
  assert.equal(english.language, 'english');
  assert.match(english.answer, /For effective revision/);
});

test('subject-specific shorthand can use the configured study duration without asking again', () => {
  const parsed = parseStudyPlannerRequest('GST detailed revision', 'CA_INTERMEDIATE');
  assert.deepEqual(parsed.subjects, ['Taxation']);
  assert.deepEqual(parsed.missing_info, ['available study time']);
});


test('recognises natural doubts and confusion as study questions', () => {
  assert.equal(isGeneralStudyQuestion("I'm confused about marginal costing"), true);
  assert.equal(isGeneralStudyQuestion("I don't understand audit evidence"), true);
  assert.equal(isGeneralStudyQuestion('I have a doubt in GST input tax credit'), true);
  assert.equal(isGeneralStudyQuestion('मुझे यह concept समझ नहीं आ रहा है'), true);
});

test('recognises ordinary study concept questions without requiring timetable details', () => {
  assert.equal(isGeneralStudyQuestion('Explain GST input tax credit'), true);
  assert.equal(isGeneralStudyQuestion('What are the provisions for salary income?'), true);
  assert.equal(isGeneralStudyQuestion('Difference between marginal costing and absorption costing'), true);
  assert.equal(isGeneralStudyQuestion('Tell me about audit evidence'), true);
  assert.equal(isGeneralStudyQuestion('Btao GST ka effective revision kaise karu'), true);
});

test('answers broader concept, memory and exam-strategy queries with study guidance', () => {
  const parsed = parseStudyPlannerRequest('Explain audit evidence', 'CA_INTERMEDIATE');
  const concept = buildGeneralStudyAnswer('Explain audit evidence', parsed);
  assert.match(concept.answer, /exam-oriented explanation/i);
  const memory = buildGeneralStudyAnswer('How do I remember provisions?', parsed);
  assert.match(memory.answer, /recall/i);
  const exam = buildGeneralStudyAnswer('How should I manage time in mock papers?', parsed);
  assert.match(exam.answer, /allocate time/i);
});


test('answers subject-specific revision questions across Foundation and Intermediate subjects without asking for duration', () => {
  const cases = [
    { course: 'CA_FOUNDATION', message: 'How do I revise Accounting effectively?', expected: 'Accounting' },
    { course: 'CA_FOUNDATION', message: 'How do I revise Business Laws effectively?', expected: 'Business Laws' },
    { course: 'CA_FOUNDATION', message: 'How do I revise Quantitative Aptitude effectively?', expected: 'Quantitative Aptitude' },
    { course: 'CA_FOUNDATION', message: 'How do I revise Business Economics effectively?', expected: 'Business Economics' },
    { course: 'CA_INTERMEDIATE', message: 'How do I revise Advanced Accounting effectively?', expected: 'Advanced Accounting' },
    { course: 'CA_INTERMEDIATE', message: 'How do I revise Corporate and Other Laws effectively?', expected: 'Corporate and Other Laws' },
    { course: 'CA_INTERMEDIATE', message: 'Btao GST ka effective revision kaise karu', expected: 'Taxation' },
    { course: 'CA_INTERMEDIATE', message: 'How do I revise Costing effectively?', expected: 'Cost and Management Accounting' },
    { course: 'CA_INTERMEDIATE', message: 'How do I revise Auditing and Ethics effectively?', expected: 'Auditing and Ethics' },
    { course: 'CA_INTERMEDIATE', message: 'How do I revise Financial Management and Strategic Management effectively?', expected: 'Financial Management and Strategic Management' },
  ];
  for (const item of cases) {
    assert.equal(isGeneralStudyQuestion(item.message), true, item.message + ' should be handled as a study question');
    const parsed = parseStudyPlannerRequest(item.message, item.course);
    assert.ok(parsed.subjects.includes(item.expected), item.course + ' should recognise ' + item.expected);
    const result = buildGeneralStudyAnswer(item.message, parsed);
    assert.match(result.answer, /revision|revise|Revision/i);
    assert.doesNotMatch(result.answer, /please provide the missing details/i);
  }
});


test('keeps English revision wording in English instead of mistaking it for Hinglish', () => {
  assert.equal(detectStudyReplyLanguage('revision plan for SM'), 'english');
  assert.equal(detectStudyReplyLanguage('SM detailed revision'), 'english');
  assert.equal(detectStudyReplyLanguage('How should I revise GST?'), 'english');
  assert.equal(detectStudyReplyLanguage('Bhai, SM ke liye revision kaise karu?'), 'hinglish');
  assert.equal(detectStudyReplyLanguage('SM के लिए revision plan बनाइए'), 'hindi');
});

test('chapter assessment prompts, completion replies and options preserve the detected language', () => {
  const englishPrompt = buildChapterAssessmentPrompt('english', 'Strategic Management');
  assert.match(englishPrompt, /^For Strategic Management/);
  assert.doesNotMatch(englishPrompt, /Bhai|select kar|bata de/i);
  const hinglishPrompt = buildChapterAssessmentPrompt('hinglish', 'Strategic Management');
  assert.match(hinglishPrompt, /^Bhai,/);
  const hindiPrompt = buildChapterAssessmentPrompt('hindi', 'Strategic Management');
  assert.match(hindiPrompt, /चुनें/);

  assert.match(buildChapterAssessmentReadyMessage('english', 'Strategic Management'), /^Your Strategic Management/);
  assert.match(buildChapterAssessmentReadyMessage('hinglish', 'Strategic Management'), /^Bhai,/);
  assert.match(buildChapterAssessmentReadyMessage('hindi', 'Strategic Management'), /तैयार है/);

  assert.deepEqual(buildPlanScopeOptions('english'), ['One-day revision plan', 'Full exam roadmap + weekly timetable until exam']);
  assert.deepEqual(buildPlanScopeOptions('hinglish'), ['Sirf ek din ka revision plan', 'Exam tak roadmap + weekly timetable']);
  assert.deepEqual(buildPlanScopeOptions('hindi'), ['सिर्फ एक दिन का revision plan', 'Exam तक roadmap + weekly timetable']);
  assert.match(buildIntermediateSMClarification('english'), /^I understand/);
  assert.match(buildIntermediateSMClarification('hinglish'), /samajh gaya bhai/);
});


test('recognises ordinary greetings and greeting nudges without swallowing real study questions', () => {
  assert.equal(isSocialGreeting('hello'), true);
  assert.equal(isSocialGreeting('Hello bhai!'), true);
  assert.equal(isSocialGreeting('hello nahi bolo ge kya?'), true);
  assert.equal(isSocialGreeting('Good morning'), true);
  assert.equal(isSocialGreeting('Hello, explain marginal costing'), false);
  assert.match(buildSocialGreetingReply('hinglish'), /Arre hello bhai/);
});

test('a short subject-plus-me message is treated as Hinglish', () => {
  assert.equal(detectStudyReplyLanguage('FM me'), 'hinglish');
  assert.equal(detectStudyReplyLanguage('How can you explain this to me?'), 'english');
});

test('bare subject clarification gives useful choices in the student language', () => {
  assert.match(buildTopicIntentClarification('hinglish', 'FM'), /FM samajh gaya bhai/);
  assert.match(buildTopicIntentClarification('english', 'FM'), /concept explanation/);
  assert.deepEqual(buildTopicIntentOptions('hinglish', 'FM'), ['FM ka concept samjhao', 'FM ki revision strategy batao', 'FM ka study plan banao']);
});


test('recognises natural Hinglish help requests and difficulty statements', () => {
  assert.equal(detectStudyReplyLanguage('FM me help kr skte ho'), 'hinglish');
  assert.equal(detectStudyReplyLanguage('FM me mujhe ratio wala chapter nahi aata hai'), 'hinglish');
  assert.equal(detectStudyReplyLanguage('How can you explain this to me?'), 'english');
  assert.equal(isGeneralStudyQuestion('FM me mujhe ratio wala chapter nahi aata hai'), true);
  assert.equal(isGeneralStudyQuestion('I am struggling with the ratio chapter'), true);
  assert.equal(isGeneralStudyQuestion('Mujhe ye concept samajh nahi aa raha'), true);
});
