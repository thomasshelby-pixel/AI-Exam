import assert from 'node:assert/strict';
import { getGeminiRequestTimeoutMs } from '../gemini.js';

assert.equal(getGeminiRequestTimeoutMs(90), 90_000, 'Configured 90-second timeout reaches the SDK in milliseconds');
assert.equal(getGeminiRequestTimeoutMs(30), 30_000, 'Configured timeout is preserved');
assert.equal(getGeminiRequestTimeoutMs(1), 10_000, 'Extremely short values are clamped to a safe minimum');
assert.equal(getGeminiRequestTimeoutMs(0), 90_000, 'Invalid zero timeout falls back to the 90-second default');
assert.equal(getGeminiRequestTimeoutMs(Number.NaN), 90_000, 'Invalid timeout values fall back safely');
assert.equal(getGeminiRequestTimeoutMs(2_000), 600_000, 'Maximum request timeout is capped at ten minutes');

console.log('Gemini request timeout tests passed.');
