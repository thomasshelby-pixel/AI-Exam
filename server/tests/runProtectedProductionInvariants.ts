import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const isolatedWorkingDirectory = mkdtempSync(path.join(os.tmpdir(), 'ca-exam-protected-invariants-'));
process.chdir(isolatedWorkingDirectory);
const databaseModule = await import(pathToFileURL(path.join(repoRoot, 'server/db.ts')).href);
process.once('beforeExit', () => {
  // db.ts registered its WAL checkpoint listener before this cleanup callback.
  databaseModule.closeDatabaseCleanly();
  process.chdir(repoRoot);
  rmSync(isolatedWorkingDirectory, { recursive: true, force: true });
});
await import(pathToFileURL(path.join(repoRoot, 'server/tests/protectedProductionInvariants.test.ts')).href);
