import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateParakhEvaluationCoaching,
  generateParakhTeachingAnswer,
} from '../services/parakhTutorService.js';

const originalEndpoint = process.env.LOCAL_MODEL_ENDPOINT;
const originalModelName = process.env.LOCAL_MODEL_NAME;
const originalFetch = globalThis.fetch;

function restoreEnvironment() {
  if (originalEndpoint === undefined) delete process.env.LOCAL_MODEL_ENDPOINT;
  else process.env.LOCAL_MODEL_ENDPOINT = originalEndpoint;
  if (originalModelName === undefined) delete process.env.LOCAL_MODEL_NAME;
  else process.env.LOCAL_MODEL_NAME = originalModelName;
  globalThis.fetch = originalFetch;
}

test('PARAKH refuses to call any model provider when the self-hosted endpoint is not configured', async () => {
  delete process.env.LOCAL_MODEL_ENDPOINT;
  let fetchCount = 0;
  globalThis.fetch = (async () => {
    fetchCount++;
    throw new Error('Unexpected network call');
  }) as typeof fetch;

  try {
    await assert.rejects(
      generateParakhTeachingAnswer({
        question: 'Explain marginal costing.',
        course: 'CA_INTERMEDIATE',
        language: 'hinglish',
      }),
      /PARAKH_LOCAL_MODEL_NOT_CONFIGURED/,
    );
    await assert.rejects(
      generateParakhEvaluationCoaching({
        course: 'CA_INTERMEDIATE',
        subject: 'Costing',
        mode: 'why',
        question: { marksAwarded: 4, maximumMarks: 6 },
      }),
      /PARAKH_LOCAL_MODEL_NOT_CONFIGURED/,
    );
    assert.equal(fetchCount, 0, 'No HTTP/model-provider request is made without the owner's endpoint');
  } finally {
    restoreEnvironment();
  }
});

test('PARAKH chat and Ask PARAKH both use only the configured self-hosted endpoint', async () => {
  process.env.LOCAL_MODEL_ENDPOINT = 'http://127.0.0.1:12345/v1/chat/completions';
  process.env.LOCAL_MODEL_NAME = 'owner-parakh-model';
  const calls: Array<{ url: string; headers: Headers; body: any }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    calls.push({
      url: String(input),
      headers,
      body: JSON.parse(String(init?.body || '{}')),
    });
    return new Response(JSON.stringify({
      model: 'owner-parakh-model-v1',
      choices: [{ message: { content: 'Self-hosted Parakh answer.' }, finish_reason: 'stop' }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const chat = await generateParakhTeachingAnswer({
      question: 'Explain marginal costing.',
      course: 'CA_INTERMEDIATE',
      language: 'hinglish',
      knowledgeContext: { key: 'curated-ca-context' },
    });
    const coaching = await generateParakhEvaluationCoaching({
      course: 'CA_INTERMEDIATE',
      subject: 'Costing',
      mode: 'improve',
      question: { marksAwarded: 4, maximumMarks: 6 },
    });

    assert.equal(chat.answer, 'Self-hosted Parakh answer.');
    assert.equal(coaching.answer, 'Self-hosted Parakh answer.');
    assert.equal(calls.length, 2);
    assert.ok(calls.every((call) => call.url === 'http://127.0.0.1:12345/v1/chat/completions'));
    assert.ok(calls.every((call) => call.body.model === 'owner-parakh-model'));
    assert.ok(calls.every((call) => call.headers.get('authorization') === null), 'No vendor API key or Authorization header is sent');
    assert.equal(chat.modelUsed, 'owner-parakh-model-v1');
  } finally {
    restoreEnvironment();
  }
});

test('PARAKH does not fall back to a hosted model when the self-hosted endpoint fails', async () => {
  process.env.LOCAL_MODEL_ENDPOINT = 'http://127.0.0.1:12345/v1/chat/completions';
  let fetchCount = 0;
  globalThis.fetch = (async () => {
    fetchCount++;
    return new Response('local engine unavailable', { status: 503 });
  }) as typeof fetch;

  try {
    await assert.rejects(
      generateParakhTeachingAnswer({
        question: 'Explain GST.',
        course: 'CA_INTERMEDIATE',
        language: 'english',
      }),
      /PARAKH_LOCAL_MODEL_HTTP_ERROR/,
    );
    assert.equal(fetchCount, 1, 'Only the configured self-hosted endpoint is attempted; no cloud LLM fallback occurs');
  } finally {
    restoreEnvironment();
  }
});
