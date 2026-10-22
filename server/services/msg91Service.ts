import { normalizePhoneToE164 } from './smsService.js';

export interface Msg91AccessTokenVerification {
  success: boolean;
  phoneE164?: string;
  error?: string;
}

/**
 * Verifies a JWT returned by the MSG91 OTP Widget using MSG91's server-side
 * verifyAccessToken endpoint. The MSG91 Authkey must remain server-side.
 */
export async function verifyMsg91WidgetAccessToken(
  accessToken: string
): Promise<Msg91AccessTokenVerification> {
  const authkey = process.env.MSG91_AUTHKEY?.trim();
  const token = typeof accessToken === 'string' ? accessToken.trim() : '';

  if (!authkey) {
    return { success: false, error: 'SMS verification is not configured on the server.' };
  }
  if (!token || token.length > 8192) {
    return { success: false, error: 'A valid SMS verification token is required.' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch('https://control.msg91.com/api/v5/widget/verifyAccessToken', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        authkey,
        'access-token': token,
      }),
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => null) as
      | { type?: unknown; message?: unknown; code?: unknown; status?: unknown }
      | null;

    // MSG91 may return HTTP 200 for an authentication failure, so inspect the body too.
    if (!response.ok || !payload || payload.type !== 'success' || typeof payload.message !== 'string') {
      console.warn('[MSG91] Widget access-token verification failed', {
        httpStatus: response.status,
        code: payload?.code,
        type: payload?.type,
      });
      return { success: false, error: 'Mobile number verification failed. Please request a new OTP.' };
    }

    const identifier = payload.message.trim();
    const normalized = normalizePhoneToE164(identifier);
    if (!normalized.canonicalPhoneE164) {
      return { success: false, error: 'MSG91 did not return a valid verified mobile number.' };
    }

    return { success: true, phoneE164: normalized.canonicalPhoneE164 };
  } catch (error: unknown) {
    console.error('[MSG91] Widget token verification request failed:', error instanceof Error ? error.message : 'unknown error');
    return { success: false, error: 'Could not verify the mobile number right now. Please try again.' };
  } finally {
    clearTimeout(timeout);
  }
}
