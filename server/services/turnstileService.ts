import type { Request } from 'express';

export interface SignupTurnstileConfig {
  required: boolean;
  siteKey: string | null;
  setupIncomplete: boolean;
}

/**
 * Turnstile is enforced by default in production. Local development and tests remain
 * usable unless TURNSTILE_REQUIRED=true is explicitly set.
 * Production can opt out temporarily with TURNSTILE_REQUIRED=false, but doing so
 * removes this automated-signup defence.
 */
export function getSignupTurnstileConfig(): SignupTurnstileConfig {
  const explicit = String(process.env.TURNSTILE_REQUIRED || '').trim().toLowerCase();
  const required = explicit === 'true' ||
    (explicit !== 'false' && (process.env.NODE_ENV === 'production' || Boolean(process.env.K_SERVICE)));
  const siteKey = String(process.env.TURNSTILE_SITE_KEY || '').trim() || null;
  const secretKey = String(process.env.TURNSTILE_SECRET_KEY || '').trim();
  return {
    required,
    siteKey,
    setupIncomplete: required && (!siteKey || !secretKey),
  };
}

export interface SignupTurnstileResult {
  valid: boolean;
  code?: 'TURNSTILE_REQUIRED' | 'TURNSTILE_NOT_CONFIGURED' | 'TURNSTILE_UNAVAILABLE' | 'TURNSTILE_REJECTED';
  message?: string;
}

/**
 * Verify the single-use Cloudflare Turnstile token on the server before sending an OTP
 * or creating any account. Never trust a client-side success callback by itself.
 */
export async function verifySignupTurnstile(
  tokenInput: unknown,
  req?: Request,
): Promise<SignupTurnstileResult> {
  const config = getSignupTurnstileConfig();
  if (!config.required) return { valid: true };

  const secret = String(process.env.TURNSTILE_SECRET_KEY || '').trim();
  if (!config.siteKey || !secret) {
    return {
      valid: false,
      code: 'TURNSTILE_NOT_CONFIGURED',
      message: 'Signup protection is not configured yet. Please try again later.',
    };
  }

  const token = typeof tokenInput === 'string' ? tokenInput.trim() : '';
  if (!token || token.length > 2048) {
    return {
      valid: false,
      code: 'TURNSTILE_REQUIRED',
      message: 'Please complete the security check before creating your account.',
    };
  }

  const form = new URLSearchParams({ secret, response: token });
  const remoteIp = req?.ip || req?.socket?.remoteAddress || '';
  if (remoteIp && remoteIp.length <= 64) form.set('remoteip', remoteIp);

  let response: Response;
  let payload: {
    success?: boolean;
    action?: string;
    hostname?: string;
    'error-codes'?: string[];
  };

  try {
    response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
      signal: AbortSignal.timeout(8000),
    });
    payload = await response.json() as typeof payload;
  } catch (error) {
    console.error('[Turnstile] Siteverify request failed:', error instanceof Error ? error.message : 'unknown error');
    return {
      valid: false,
      code: 'TURNSTILE_UNAVAILABLE',
      message: 'Security verification is temporarily unavailable. Please try again.',
    };
  }

  if (!response.ok || payload.success !== true) {
    // Do not log user-submitted tokens or secret keys.
    console.warn('[Turnstile] Signup token rejected', {
      httpStatus: response.status,
      errorCodes: payload['error-codes'] || [],
    });
    return {
      valid: false,
      code: 'TURNSTILE_REJECTED',
      message: 'Security check failed or expired. Please complete it again.',
    };
  }

  // Match the action authored by our own widget to prevent a token from another form
  // being replayed for registration. The widget below always requests action="signup".
  if (payload.action !== 'signup') {
    return {
      valid: false,
      code: 'TURNSTILE_REJECTED',
      message: 'Security check was not valid for student registration. Please try again.',
    };
  }

  const allowedHostnames = String(process.env.TURNSTILE_ALLOWED_HOSTNAMES || '')
    .split(',')
    .map((hostname) => hostname.trim().toLowerCase())
    .filter(Boolean);
  if (allowedHostnames.length > 0) {
    const verifiedHostname = String(payload.hostname || '').trim().toLowerCase();
    if (!verifiedHostname || !allowedHostnames.includes(verifiedHostname)) {
      console.warn('[Turnstile] Signup token returned unexpected hostname', {
        hostname: verifiedHostname || '(missing)',
      });
      return {
        valid: false,
        code: 'TURNSTILE_REJECTED',
        message: 'Security check came from an unrecognized site. Refresh and try again.',
      };
    }
  }

  return { valid: true };
}
