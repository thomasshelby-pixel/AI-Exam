import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getSignupTurnstileConfig,
  verifySignupTurnstile,
} from '../services/turnstileService.js';

const watchedEnv = [
  'NODE_ENV',
  'K_SERVICE',
  'TURNSTILE_REQUIRED',
  'TURNSTILE_SITE_KEY',
  'TURNSTILE_SECRET_KEY',
  'TURNSTILE_ALLOWED_HOSTNAMES',
] as const;

function withEnvironment(values: Partial<Record<(typeof watchedEnv)[number], string | undefined>>, fn: () => Promise<void> | void) {
  const previous = Object.fromEntries(watchedEnv.map((key) => [key, process.env[key]]));
  for (const key of watchedEnv) {
    const value = values[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  const restore = () => {
    for (const key of watchedEnv) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };

  try {
    const result = fn();
    if (result && typeof (result as Promise<void>).then === 'function') {
      return (result as Promise<void>).finally(restore);
    }
    restore();
  } catch (error) {
    restore();
    throw error;
  }
}

test('Turnstile is optional in development unless explicitly enabled', () => {
  withEnvironment({ NODE_ENV: 'development', K_SERVICE: undefined, TURNSTILE_REQUIRED: undefined, TURNSTILE_SITE_KEY: undefined, TURNSTILE_SECRET_KEY: undefined }, () => {
    assert.deepEqual(getSignupTurnstileConfig(), {
      required: false,
      siteKey: null,
      setupIncomplete: false,
    });
  });
});

test('Turnstile defaults to required in production and fails closed when keys are missing', () => {
  withEnvironment({ NODE_ENV: 'production', K_SERVICE: undefined, TURNSTILE_REQUIRED: undefined, TURNSTILE_SITE_KEY: undefined, TURNSTILE_SECRET_KEY: undefined }, () => {
    assert.deepEqual(getSignupTurnstileConfig(), {
      required: true,
      siteKey: null,
      setupIncomplete: true,
    });
  });
});

test('explicit Turnstile opt-out is honored for an intentional temporary rollback', () => {
  withEnvironment({ NODE_ENV: 'production', K_SERVICE: undefined, TURNSTILE_REQUIRED: 'false', TURNSTILE_SITE_KEY: undefined, TURNSTILE_SECRET_KEY: undefined }, () => {
    assert.equal(getSignupTurnstileConfig().required, false);
    assert.equal(getSignupTurnstileConfig().setupIncomplete, false);
  });
});

test('Turnstile-required signup rejects missing tokens without calling Cloudflare', async () => {
  await withEnvironment({ NODE_ENV: 'test', K_SERVICE: undefined, TURNSTILE_REQUIRED: 'true', TURNSTILE_SITE_KEY: 'site-key', TURNSTILE_SECRET_KEY: 'secret-key', TURNSTILE_ALLOWED_HOSTNAMES: undefined }, async () => {
    const result = await verifySignupTurnstile('');
    assert.equal(result.valid, false);
    assert.equal(result.code, 'TURNSTILE_REQUIRED');
  });
});

test('Turnstile fails closed if Siteverify cannot be reached', async () => {
  await withEnvironment({ NODE_ENV: 'test', K_SERVICE: undefined, TURNSTILE_REQUIRED: 'true', TURNSTILE_SITE_KEY: 'site-key', TURNSTILE_SECRET_KEY: 'secret-key', TURNSTILE_ALLOWED_HOSTNAMES: undefined }, async () => {
    const oldFetch = globalThis.fetch;
    globalThis.fetch = (async () => { throw new Error('offline'); }) as typeof fetch;
    try {
      const result = await verifySignupTurnstile('token');
      assert.equal(result.valid, false);
      assert.equal(result.code, 'TURNSTILE_UNAVAILABLE');
    } finally {
      globalThis.fetch = oldFetch;
    }
  });
});

test('Turnstile requires a signup action and rejects tokens from other actions', async () => {
  await withEnvironment({ NODE_ENV: 'test', K_SERVICE: undefined, TURNSTILE_REQUIRED: 'true', TURNSTILE_SITE_KEY: 'site-key', TURNSTILE_SECRET_KEY: 'secret-key', TURNSTILE_ALLOWED_HOSTNAMES: undefined }, async () => {
    const oldFetch = globalThis.fetch;
    globalThis.fetch = (async () => ({
      ok: true,
      json: async () => ({ success: true, action: 'login', hostname: 'caexamcheckerai.com' }),
    } as Response)) as typeof fetch;
    try {
      const result = await verifySignupTurnstile('one-time-token');
      assert.equal(result.valid, false);
      assert.equal(result.code, 'TURNSTILE_REJECTED');
    } finally {
      globalThis.fetch = oldFetch;
    }
  });
});

test('Turnstile accepts a valid signup token only from an allowlisted hostname', async () => {
  await withEnvironment({ NODE_ENV: 'test', K_SERVICE: undefined, TURNSTILE_REQUIRED: 'true', TURNSTILE_SITE_KEY: 'site-key', TURNSTILE_SECRET_KEY: 'secret-key', TURNSTILE_ALLOWED_HOSTNAMES: 'caexamcheckerai.com, caexamcheckerai-prod--gen-lang-client-0211426234.asia-southeast1.hosted.app' }, async () => {
    const oldFetch = globalThis.fetch;
    let sentBody = '';
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      sentBody = String(init?.body || '');
      return {
        ok: true,
        json: async () => ({ success: true, action: 'signup', hostname: 'caexamcheckerai.com' }),
      } as Response;
    }) as typeof fetch;
    try {
      const result = await verifySignupTurnstile('single-use-token');
      assert.equal(result.valid, true);
      assert.match(sentBody, /response=single-use-token/);
      assert.match(sentBody, /secret=secret-key/);
    } finally {
      globalThis.fetch = oldFetch;
    }
  });
});

test('Turnstile rejects a valid token when the verified hostname is not allowlisted', async () => {
  await withEnvironment({ NODE_ENV: 'test', K_SERVICE: undefined, TURNSTILE_REQUIRED: 'true', TURNSTILE_SITE_KEY: 'site-key', TURNSTILE_SECRET_KEY: 'secret-key', TURNSTILE_ALLOWED_HOSTNAMES: 'caexamcheckerai.com' }, async () => {
    const oldFetch = globalThis.fetch;
    globalThis.fetch = (async () => ({
      ok: true,
      json: async () => ({ success: true, action: 'signup', hostname: 'attacker.example' }),
    } as Response)) as typeof fetch;
    try {
      const result = await verifySignupTurnstile('single-use-token');
      assert.equal(result.valid, false);
      assert.equal(result.code, 'TURNSTILE_REJECTED');
    } finally {
      globalThis.fetch = oldFetch;
    }
  });
});
