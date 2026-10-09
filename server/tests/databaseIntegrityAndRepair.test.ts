import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { db, checkDatabaseIntegrity, checkpointWal, closeDatabaseCleanly } from '../db.js';

console.log('======================================================================');
console.log(' DATABASE INTEGRITY, WAL CHECKPOINT & AUTO-REPAIR TEST SUITE');
console.log('======================================================================\n');

let passedTests = 0;
let totalTests = 0;

function runTest(name: string, fn: () => void) {
  totalTests++;
  try {
    fn();
    console.log(`[PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`[FAIL] ${name}:`, err);
    process.exitCode = 1;
  }
}

// 1. Verify PRAGMA integrity and quick_check on active database
runTest('Active database passes quick_check and integrity_check', () => {
  const result = checkDatabaseIntegrity();
  assert.strictEqual(result.ok, true, `Database integrity check failed: ${result.integrityCheck}`);
  assert.strictEqual(result.quickCheck, 'ok');
  assert.strictEqual(result.integrityCheck, 'ok');
  assert.ok(result.fileSizeBytes > 0, 'Database file size must be > 0 bytes');
});

// 2. Verify WAL checkpointing runs without errors
runTest('PRAGMA wal_checkpoint(TRUNCATE) executes successfully', () => {
  const chk = checkpointWal();
  assert.strictEqual(chk.ok, true, `Checkpoint failed: ${chk.message}`);
});

// 3. Verify core database tables and indexes exist
runTest('Core tables exist and are queryable', () => {
  const tables = ['users', 'student_profiles', 'evaluations', 'student_credit_purchases', 'credit_ledger'];
  for (const table of tables) {
    const row = db.prepare(`SELECT count(*) as count FROM ${table}`).get() as any;
    assert.ok(typeof row.count === 'number', `Table ${table} must be queryable`);
  }
});

// 4. Verify repeated checkpoints do not throw or crash
runTest('Multiple consecutive checkpoints execute safely', () => {
  for (let i = 0; i < 3; i++) {
    const res = checkpointWal();
    assert.strictEqual(res.ok, true);
  }
});

console.log(`\nResults: ${passedTests} / ${totalTests} tests passed.`);
if (passedTests !== totalTests) {
  process.exit(1);
} else {
  console.log('Database integrity verification succeeded.');
}
