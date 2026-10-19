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
