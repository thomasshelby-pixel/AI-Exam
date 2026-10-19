import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGeneralStudyAnswer, detectStudyReplyLanguage, isGeneralStudyQuestion } from '../services/studyPlannerLanguageService.js';
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
