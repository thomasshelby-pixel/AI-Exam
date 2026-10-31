import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { buildStudentOwnershipSql, getStudentOwnershipParams } from '../services/studentOwnershipService.js';

const db = new DatabaseSync(':memory:');
db.exec(`
  CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL);
  CREATE TABLE evaluations (id TEXT PRIMARY KEY, student_id TEXT NOT NULL);
`);

const insertUser = db.prepare('INSERT INTO users (id, email) VALUES (?, ?)');
const insertEvaluation = db.prepare('INSERT INTO evaluations (id, student_id) VALUES (?, ?)');

const accountAId = 'usr_bf97ebeeae7273b7';
const accountAEmail = 'at9767676@gmail.com';
const accountBId = 'usr_user_at9767';
const accountBEmail = 'adityakumart484@gmail.com';
const demoAccountId = 'usr_student_demo_001';
const demoAccountEmail = 'student@caexamchecker.ai';
const generatedStudentId = 'student_v_generated_fixture';

insertUser.run(accountAId, accountAEmail);
insertUser.run(accountBId, accountBEmail);
insertUser.run(demoAccountId, demoAccountEmail);
insertUser.run(generatedStudentId, 'generated-student@example.test');

// Duplicate IDs for the same verified email remain available for legacy migration.
insertUser.run('usr_account_a_legacy', accountAEmail);

insertEvaluation.run('eval_account_a', accountAId);
insertEvaluation.run('eval_account_a_legacy', 'usr_account_a_legacy');
insertEvaluation.run('eval_account_b', accountBId);
insertEvaluation.run('eval_demo', demoAccountId);
insertEvaluation.run('eval_generated_student', generatedStudentId);

const selectVisibleEvaluationIds = (userId: string, email: string): string[] => {
  const sql = `
    SELECT e.id
    FROM evaluations e
    LEFT JOIN users u ON u.id = e.student_id
    WHERE ${buildStudentOwnershipSql('e', 'u')}
    ORDER BY e.id
  `;
  return (db.prepare(sql).all(...getStudentOwnershipParams(userId, email)) as Array<{id: string}>).map((row) => row.id);
};

assert.deepEqual(
  selectVisibleEvaluationIds(accountAId, accountAEmail),
  ['eval_account_a', 'eval_account_a_legacy'],
  'Account A must see only its own rows and same-email legacy rows'
);
assert.deepEqual(
  selectVisibleEvaluationIds(accountBId, accountBEmail),
  ['eval_account_b'],
  'Account B must not see Account A evaluations'
);
assert.deepEqual(
  selectVisibleEvaluationIds(demoAccountId, demoAccountEmail),
  ['eval_demo'],
  'A demo login must not gain broad access to generated student records'
);
assert.deepEqual(
  selectVisibleEvaluationIds(generatedStudentId, 'generated-student@example.test'),
  ['eval_generated_student'],
  'Generated student accounts must remain isolated'
);

const normalizedParams = getStudentOwnershipParams('usr_case_check', '  STUDENT@EXAMPLE.TEST  ');
assert.deepEqual(normalizedParams, ['usr_case_check', 'student@example.test', 'student@example.test']);

db.close();
console.log('Student evaluation ownership isolation tests: passed.');
