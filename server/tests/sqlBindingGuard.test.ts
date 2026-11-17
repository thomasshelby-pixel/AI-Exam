import assert from 'node:assert/strict';
import {
  assertSqlParameterCount,
  countSqlParameterPlaceholders,
} from '../services/sqlBindingGuard.js';

const claimSql = `
  UPDATE evaluations
  SET status = CASE WHEN ? = 1 THEN 'QUEUED' ELSE status END,
      result_json = CASE WHEN ? = 1 THEN NULL ELSE result_json END
  WHERE id = ?
    AND (? = 1 AND status = 'NEEDS_REVIEW')
    -- A question mark in this comment is not a bind placeholder: ?
    AND COALESCE(progress_stage, '') <> 'RECOVERY_CLAIMED'
`;

assert.equal(countSqlParameterPlaceholders(claimSql), 4);
assert.equal(assertSqlParameterCount(claimSql, [1, 1, 'eval_1', 1], 'Admin claim'), 4);
assert.throws(
  () => assertSqlParameterCount(claimSql, [1, 1, 'eval_1'], 'Admin claim'),
  /SQL_BIND_PARAMETER_MISMATCH: Admin claim expects 4 positional values but received 3/,
);

const actualBindParameters = [
  ...Array.from({ length: 19 }, () => 1),
  'eval_actual',
  0,
  1,
  1,
];
assert.equal(actualBindParameters.length, 23);
assertSqlParameterCount(
  `UPDATE evaluations SET a = CASE WHEN ? = 1 THEN 1 END, b = CASE WHEN ? = 1 THEN 1 END,
    c = CASE WHEN ? = 1 THEN 1 END, d = CASE WHEN ? = 1 THEN 1 END,
    e = CASE WHEN ? = 1 THEN 1 END, f = CASE WHEN ? = 1 THEN 1 END,
    g = CASE WHEN ? = 1 THEN 1 END, h = CASE WHEN ? = 1 THEN 1 END,
    i = CASE WHEN ? = 1 THEN 1 END, j = CASE WHEN ? = 1 THEN 1 END,
    k = CASE WHEN ? = 1 THEN 1 END, l = CASE WHEN ? = 1 THEN 1 END,
    m = CASE WHEN ? = 1 THEN 1 END, n = CASE WHEN ? = 1 THEN 1 END,
    o = CASE WHEN ? = 1 THEN 1 END, p = CASE WHEN ? = 1 THEN 1 END,
    q = CASE WHEN ? = 1 THEN 1 END, r = CASE WHEN ? = 1 THEN 1 END,
    s = CASE WHEN ? = 1 THEN 1 END
    WHERE id = ? AND (? = 0 OR status = 'NEEDS_REVIEW') AND (? = 1 OR status <> '')
      AND (? = 1 OR status <> '')`,
  actualBindParameters,
  'Admin reprocess claim',
);

console.log('✅ SQL positional parameter guard catches missing bindings and accepts the corrected Admin claim.');
