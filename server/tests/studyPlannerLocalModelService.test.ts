import test from 'node:test';
import assert from 'node:assert/strict';
import { generateStudyPlannerLocalReply } from '../services/studyPlannerLocalModelService.js';

const ENV_KEYS = [
  'STUDY_PLANNER_LLM_BASE_URL',
  'STUDY_PLANNER_LLM_MODEL',
  'STUDY_PLANNER_LLM_API_KEY',
  'STUDY_PLANNER_LLM_TIMEOUT_MS',
] as const;

function saveEnvironment(): Record<string, string | undefined> {
  return Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
}

function restoreEnvironment(saved: Record<string, string | undefined>): void {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
}

test('keeps the deterministic path when no self-hosted model URL is configured', async () => {
  const saved = saveEnvironment();
  const previousFetch = globalThis.fetch;
  try {
    delete process.env.STUDY_PLANNER_LLM_BASE_URL;
    globalThis.fetch = async () => {
      throw new Error('fetch must not be called without a configured endpoint');
    };
    const reply = await generateStudyPlannerLocalReply({
      course: 'CA_INTERMEDIATE',
      message: 'Explain audit evidence',
      replyLanguage: 'english',
    });
    assert.equal(reply, null);
  } finally {
    restoreEnvironment(saved);
    globalThis.fetch = previousFetch;
  }
});

test('sends CA course, language, and recent conversation context to Ollama', async () => {
  const saved = saveEnvironment();
  const previousFetch = globalThis.fetch;
  let capturedUrl = '';
  let capturedHeaders: HeadersInit | undefined;
  let capturedBody: Record<string, any> | undefined;
  try {
    process.env.STUDY_PLANNER_LLM_BASE_URL = 'http://ollama.internal:11434/';
    process.env.STUDY_PLANNER_LLM_MODEL = 'qwen3:4b-instruct';
    process.env.STUDY_PLANNER_LLM_API_KEY = 'test-local-key';
    globalThis.fetch = async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = init?.headers;
      capturedBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({
        message: { role: 'assistant', content: 'Bhai, audit evidence means the information used by an auditor to reach conclusions.' },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    const reply = await generateStudyPlannerLocalReply({
      course: 'CA_INTERMEDIATE',
      message: 'Explain audit evidence in simple words',
      replyLanguage: 'hinglish',
      conversationHistory: [
        'Student: I am studying Auditing and Ethics.',
        'Planner: Great, we can focus on audit concepts.',
      ],
    });

    assert.equal(capturedUrl, 'http://ollama.internal:11434/api/chat');
    assert.equal((capturedHeaders as Record<string, string>).Authorization, 'Bearer test-local-key');
    assert.equal(capturedBody?.model, 'qwen3:4b-instruct');
    assert.equal(capturedBody?.stream, false);
    assert.equal(capturedBody?.think, false);
    assert.equal(capturedBody?.messages[0].role, 'system');
    assert.match(capturedBody?.messages[0].content, /CA Intermediate/);
    assert.match(capturedBody?.messages[0].content, /Hinglish/);
    assert.deepEqual(capturedBody?.messages.slice(1, 3).map((item: any) => item.role), ['user', 'assistant']);
    assert.equal(capturedBody?.messages.at(-1).content, 'Explain audit evidence in simple words');
    assert.match(reply || '', /audit evidence means/);
  } finally {
    restoreEnvironment(saved);
    globalThis.fetch = previousFetch;
  }
});

test('falls back cleanly when the local model endpoint fails', async () => {
  const saved = saveEnvironment();
  const previousFetch = globalThis.fetch;
  try {
    process.env.STUDY_PLANNER_LLM_BASE_URL = 'http://ollama.internal:11434';
    globalThis.fetch = async () => new Response('unavailable', { status: 503 });
    const reply = await generateStudyPlannerLocalReply({
      course: 'CA_FOUNDATION',
      message: 'How should I revise Business Laws?',
      replyLanguage: 'english',
    });
    assert.equal(reply, null);
  } finally {
    restoreEnvironment(saved);
    globalThis.fetch = previousFetch;
  }
});

test('rejects a non-HTTP model URL without making a network request', async () => {
  const saved = saveEnvironment();
  const previousFetch = globalThis.fetch;
  try {
    process.env.STUDY_PLANNER_LLM_BASE_URL = 'file:///tmp/model';
    globalThis.fetch = async () => {
      throw new Error('fetch must not be called for an invalid URL');
    };
    const reply = await generateStudyPlannerLocalReply({
      course: 'CA_FOUNDATION',
      message: 'Explain accounting standards',
      replyLanguage: 'english',
    });
    assert.equal(reply, null);
  } finally {
    restoreEnvironment(saved);
    globalThis.fetch = previousFetch;
  }
});
