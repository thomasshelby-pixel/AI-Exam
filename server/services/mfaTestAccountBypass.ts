export interface MfaTestBypassCandidate {
  email?: string | null;
  role?: string | null;
  status?: string | null;
}

/**
 * Explicit, reversible MFA exception for one controlled test Institute Admin.
 * Both deployment settings are required so adding an email alone cannot disable
 * MFA. This never applies to Super Admin, other admins, or student accounts.
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

  return enabled &&
    configuredEmail.length > 0 &&
    accountEmail === configuredEmail &&
    role === 'INSTITUTE_ADMIN' &&
    status === 'ACTIVE';
}
