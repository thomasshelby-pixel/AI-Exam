/**
 * Determines whether the Institute Portal should enforce its client-side MFA gate.
 * The server is authoritative: mfaMandatory=false is an explicit exemption, while
 * missing mfaMandatory remains fail-closed for legacy/stale user payloads.
 */
export function isInstituteMfaGateRequired(
  user: { role?: string | null; mfaMandatory?: boolean | null } | null | undefined,
): boolean {
  const role = String(user?.role || '').trim().toUpperCase().replace(/\s+/g, '_');
  const instituteAdminRole = role === 'INSTITUTE_ADMIN' || role === 'INSTITUTE';
  return instituteAdminRole && user?.mfaMandatory !== false;
}
