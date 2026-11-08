import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyParakhQuestion } from '../services/parakhQualityFramework.js';
import {
  parseGoogleNewsRss,
  parseSearxngResults,
  sanitiseParakhSearchQuery,
  shouldUseParakhWebResearch,
} from '../services/studyPlannerWebResearchService.js';

test('detects current-information and explicit web-search requests', () => {
  assert.equal(shouldUseParakhWebResearch('What is the latest ICAI notification?'), true);
  assert.equal(shouldUseParakhWebResearch('Browse the internet for current RBI repo rate'), true);
  assert.equal(shouldUseParakhWebResearch('Explain the concept of current ratio'), false);
  assert.equal(shouldUseParakhWebResearch('The firm proposes a new credit policy of 2/15 net 60 instead of 1/15 net 45. Should it change the policy?'), false);
  assert.equal(shouldUseParakhWebResearch('What is the latest ICAI exam result update?'), true);
});

test('removes identifiers and contact details before producing a search query', () => {
  const query = sanitiseParakhSearchQuery(
    'Latest ICAI exam notification, email student@example.com, phone +91 98765 43210, student id: STU-192837',
  );
  assert.doesNotMatch(query, /student@example\.com|98765|STU-192837/i);
  assert.match(query, /ICAI exam notification/i);
});

test('parses RSS sources and ignores invalid or non-http links', () => {
  const xml = "<rss><channel>" +
    "<item><title>ICAI exam update</title><link>https://www.icai.org/post/example</link><description>Official examination notice</description><pubDate>Sun, 08 Nov 2026 10:00:00 GMT</pubDate></item>" +
    "<item><title>Unsafe link</title><link>javascript:alert(1)</link><description>Ignore</description></item>" +
    "</channel></rss>";
  const results = parseGoogleNewsRss(xml);
  assert.equal(results.length, 1);
  assert.equal(results[0].title, 'ICAI exam update');
  assert.equal(results[0].url, 'https://www.icai.org/post/example');
  assert.match(results[0].snippet, /Official examination notice/);
});

test('parses SearXNG JSON results while filtering unsafe URLs', () => {
  const results = parseSearxngResults({
    results: [
      { title: 'RBI policy', url: 'https://www.rbi.org.in/example', content: 'Policy details' },
      { title: 'Local host', url: 'http://127.0.0.1/private', content: 'Unsafe' },
      { title: 'Script', url: 'javascript:alert(1)', content: 'Unsafe' },
    ],
  });
  assert.equal(results.length, 1);
  assert.equal(results[0].title, 'RBI policy');
});


test('statutory section questions request primary-source research while current ratio remains a study topic', () => {
  const sectionQuestion = classifyParakhQuestion(
    'Explain the Section 80C deduction under income tax',
    ['Taxation'],
  );
  assert.equal(sectionQuestion.kind, 'statutory_application');
  assert.equal(sectionQuestion.requiresPrimarySource, true);

  const ratioQuestion = classifyParakhQuestion(
    'Explain current ratio in Financial Management',
    ['Financial Management and Strategic Management'],
  );
  assert.equal(ratioQuestion.kind, 'numerical');
  assert.equal(ratioQuestion.requiresPrimarySource, false);
});
