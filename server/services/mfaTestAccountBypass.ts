export const APPROVED_TEST_INSTITUTE_ADMIN_EMAIL = 'test@gmail.com';

export interface MfaTestBypassCandidate {
  email?: string | null;
  role?: string | null;
  status?: string | null;
  account_classification?: string | null;
}

/** True only for the single email intentionally reserved as the test institute. */
export function isApprovedTestInstituteAdminEmail(value: unknown): boolean {
  return String(value || '').trim().toLowerCase() === APPROVED_TEST_INSTITUTE_ADMIN_EMAIL;
}

/**
 * Narrow MFA exception for the designated test Institute Admin.
 *
 * Production env flags may explicitly enable the bypass, but this account must
 * also be marked TEST in the persisted user registry. The fixed test address is
 * intentionally supported as a fallback because Firebase App Hosting may not
 * have the repo's local YAML environment values applied to an already-created
 * backend. No other account can use this fallback.
 */
export function isConfiguredInstituteTestAccountMfaBypass(
  user: MfaTestBypassCandidate,
  env: Record<string, string | undefined> = process.env,
): boolean {
  const enabled = String(env.ENABLE_TEST_ACCOUNT_MFA_BYPASS || '').trim().toLowerCase() === 'true';
  const configuredEmail = String(env.MFA_TEST_BYPASS_EMAIL || '').trim().toLowerCase();
  const accountEmail = String(user.email || '').trim().toLowerCase();
  const role = String(user.role || '').trim().toUpperCase();
  const status = String(user.status || '').trim().toUpperCase();
  const classification = String(user.account_classification || '').trim().toUpperCase();
  const explicitlyConfigured = enabled && configuredEmail.length > 0 && accountEmail === configuredEmail;
  const designatedTestAccount = isApprovedTestInstituteAdminEmail(accountEmail);

  return role === 'INSTITUTE_ADMIN' &&
    status === 'ACTIVE' &&
    classification === 'TEST' &&
    (explicitlyConfigured || designatedTestAccount);
}
