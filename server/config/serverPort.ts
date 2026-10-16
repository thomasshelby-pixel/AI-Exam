/**
 * Authoritative Server Runtime Port & Environment Configuration
 * 
 * Strict Single Source of Truth for Server Port Configuration:
 * - If PORT is provided in environment (e.g. Cloud Run, Firebase App Hosting, CI, or local override), respect it.
 * - Otherwise defaults strictly to 8080 per production specification.
 * - Never falls back to 3000 in production startup paths.
 */

export function getServerPort(): number {
  if (process.env.PORT !== undefined && process.env.PORT !== null) {
    const trimmed = String(process.env.PORT).trim();
    if (trimmed !== '') {
      const parsed = Number(trimmed);
      if (!Number.isNaN(parsed) && parsed > 0) {
        return parsed;
      }
    }
  }
  // Check CLI arguments for --port <PORT> (e.g. from local development runner)
  const portArgIndex = process.argv.indexOf('--port');
  if (portArgIndex !== -1 && process.argv[portArgIndex + 1]) {
    const parsedArg = Number(process.argv[portArgIndex + 1].trim());
    if (!Number.isNaN(parsedArg) && parsedArg > 0) {
      return parsedArg;
    }
  }
  return 8080;
}

export const SERVER_PORT: number = getServerPort();
export const SERVER_HOST: string = '0.0.0.0';

