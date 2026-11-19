import { randomBytes } from 'node:crypto';

export function resolveJwtSecret(
  env: Record<string, string | undefined> = process.env,
): string {
  const configured = String(env.JWT_SECRET || '').trim();
  if (String(env.NODE_ENV || '').trim().toLowerCase() === 'production' && !configured) {
    throw new Error(
      'FATAL SECURITY ERROR: JWT_SECRET environment variable is missing. Configure it as a production secret before starting the server.',
    );
  }

  // Development/test sessions use an ephemeral process-local key rather than
  // a source-controlled default. Restarting the process invalidates these tokens.
  return configured || randomBytes(64).toString('hex');
}
