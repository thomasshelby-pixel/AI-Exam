export type AuthPortalScope = 'STUDENT' | 'SUPER_ADMIN';

export type ParsedAuthPortalScope = AuthPortalScope | 'INVALID' | null;

/**
 * A portal scope may narrow where credentials are accepted, but never grants a
 * role. The database-backed account role remains authoritative.
 */
export function parseAuthPortalScope(value: unknown): ParsedAuthPortalScope {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') return 'INVALID';
  const scope = value.trim().toUpperCase();
  if (scope === 'STUDENT' || scope === 'SUPER_ADMIN') return scope;
  return 'INVALID';
}

export function isAuthPortalRoleAllowed(actualRole: unknown, portalScope: AuthPortalScope | null): boolean {
  if (!portalScope) return true;
  const role = String(actualRole || '').trim().toUpperCase().replace(/\\s+/g, '_');
  if (portalScope === 'STUDENT') return role === 'STUDENT';
  return role === 'SUPER_ADMIN' || role === 'ADMIN';
}
