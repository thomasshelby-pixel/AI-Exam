import { db } from '../db.js';
import fs from 'node:fs';

const row: any = db.prepare("SELECT * FROM evaluations WHERE id = 'eval_xc6ro0cw_1790763841656'").get();
if (!row) {
  console.error('Row not found!');
  process.exit(1);
}

console.log('--- EVAL_XC6 METADATA ---');
console.log({
  id: row.id,
  level: row.level,
  subject_key: row.subject_key,
  subject_name: row.subject_name,
  paper: row.paper,
  attempt: row.attempt,
  total_marks: row.total_marks,
  maximum_marks: row.maximum_marks,
  percentage: row.percentage,
  grade: row.grade,
  status: row.status,
  original_filename: row.original_filename,
  file_size: row.file_size,
  created_at: row.created_at,
  completed_at: row.completed_at,
  has_result_json: Boolean(row.result_json),
  has_annotations_json: Boolean(row.annotations_json),
});

fs.writeFileSync('data/eval_xc6_result.json', row.result_json || '{}');
fs.writeFileSync('data/eval_xc6_annotations.json', row.annotations_json || '{}');
fs.writeFileSync('data/eval_xc6_full_row.json', JSON.stringify(row, null, 2));

console.log('Exported data/eval_xc6_result.json and data/eval_xc6_full_row.json');
