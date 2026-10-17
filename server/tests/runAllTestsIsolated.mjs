import { cpSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const isolatedRoot = mkdtempSync(path.join(os.tmpdir(), 'ca-exam-all-tests-'));
const allTestFiles = [
  'sourceGroundedTransformation.test.ts',
  'evaluationIntegrity.test.ts',
  'evaluationIntegrityHardening.test.ts',
  'evaluationSupervisor.test.ts',
  'examinerProfileAndCsCma.test.ts',
  'googleAuthAndSrnValidation.test.ts',
  'studentProfileCoursePersistence.test.ts',
  'adminStudentEvaluationCounts.test.ts',
  'mcqMaterialUploadAndDuplicate.test.ts',
  'instituteSubscriptionGatingAndTrustedDevice.test.ts',
  'mcqCaseBasedBulkImportAndQuickResume.test.ts',
  'serviceWorkerAndOfflineNotification.test.ts',
  'studentKeyboardShortcutsAndMaterialArchitecture.test.ts',
  'mcqFeatureControlAndAccess.test.ts',
  'mcqQuestionBankBulkDelete.test.ts',
  'mcqDeterministicExtractionAudit.test.ts',
  'mcqAdminReferenceFlow.test.ts',
  'mcqMaterialBulkDeleteAndPracticeFilter.test.ts',
];
const testFiles = process.argv.slice(2).length > 0 ? process.argv.slice(2) : allTestFiles;

try {
  for (const entry of ['server', 'src', 'public']) {
    cpSync(path.join(repoRoot, entry), path.join(isolatedRoot, entry), { recursive: true });
  }
  for (const entry of ['package.json', 'tsconfig.json', 'index.html', 'vite.config.ts', 'metadata.json']) {
    try { cpSync(path.join(repoRoot, entry), path.join(isolatedRoot, entry)); } catch {}
  }
  mkdirSync(path.join(isolatedRoot, 'data'), { recursive: true });
  mkdirSync(path.join(isolatedRoot, 'uploads'), { recursive: true });

  const tsxCli = path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const childEnv = { ...process.env, NODE_ENV: 'test' };
  const failures = [];
  for (const testFile of testFiles) {
    console.log(`\nRUN ${testFile}`);
    const result = spawnSync(
      process.execPath,
      [tsxCli, path.join(repoRoot, 'server', 'tests', testFile)],
      { cwd: isolatedRoot, env: childEnv, stdio: 'inherit' },
    );
    if (result.error) throw result.error;
    if (result.status !== 0) {
      failures.push(`${testFile} failed with exit status ${result.status ?? 'unknown'}.`);
    }
  }
  if (failures.length > 0) {
    throw new Error(`${failures.length}/${testFiles.length} test files failed:\n${failures.join('\n')}`);
  }
  console.log(`\nAll ${testFiles.length} test files passed in an isolated workspace without Firebase configuration.`);
} finally {
  rmSync(isolatedRoot, { recursive: true, force: true });
}
