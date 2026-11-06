import assert from 'node:assert/strict';
import express from 'express';
import { db, initDatabase } from '../db.js';
import { generateToken } from '../auth.js';
import { findEvaluationMaterialByExactIdForRecovery } from '../services/materialLookupService.js';
import adminRoutes from '../routes/adminRoutes.js';

async function run() {
  initDatabase();

  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const studentId = `usr_material_recovery_${suffix}`;
  const email = `material_recovery_${suffix}@example.com`;
  const materialId = `mat_archived_recovery_${suffix}`;
  const evaluationId = `eval_material_recovery_${suffix}`;

  const token = generateToken({
    id: 'usr_super_admin_001',
    email: 'support@caexamcheckerai.com',
    role: 'SUPER_ADMIN',
    fullName: 'Super Admin Examiner',
  });

  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRoutes);
  const server = app.listen(0);
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    db.prepare(`
      INSERT INTO users (id, email, password_hash, full_name, role, status)
      VALUES (?, ?, 'test-hash', 'Material Recovery Student', 'STUDENT', 'ACTIVE')
    `).run(studentId, email);

    db.prepare(`
      INSERT INTO evaluation_materials (
        id, level, material_type, subject_key, subject_name, paper, attempt,
        question_paper_title, question_paper_text, suggested_answers_text, status, source_format
      ) VALUES (?, 'INTERMEDIATE', 'PYQ', 'inter_advanced_accounting', 'Advanced Accounting', 'Paper 1', 'May 2027',
        'Archived historical test material',
        'Question Paper source text retained for an already accepted evaluation. This is not a new-submission lookup.',
        'Suggested Answer source text retained for an already accepted evaluation. The full historical pair remains linked.',
        'INACTIVE', 'SEPARATE')
    `).run(materialId);

    const historical = findEvaluationMaterialByExactIdForRecovery(materialId);
    assert.ok(historical, 'Exact historical material ID should still resolve when archived');
    assert.equal(historical.status, 'INACTIVE', 'Historical lookup must not silently reactivate the source');
    assert.match(String(historical.question_paper_text), /Question Paper source text/);
    assert.match(String(historical.suggested_answers_text), /Suggested Answer source text/);
    assert.equal(
      findEvaluationMaterialByExactIdForRecovery(`deleted_${materialId}`),
      null,
      'An actually deleted exact material must not be replaced by a fuzzy substitute'
    );

    db.prepare(`
      INSERT INTO evaluations (
        id, student_id, level, material_type, subject_key, subject_name, paper, attempt,
        material_id, original_filename, checking_mode, status
      ) VALUES (?, ?, 'INTERMEDIATE', 'PYQ', 'inter_advanced_accounting', 'Advanced Accounting', 'Paper 1', 'May 2027',
        ?, 'answer-sheet.pdf', 'standard', 'PROCESSING')
    `).run(evaluationId, studentId, materialId);

    const deleteResponse = await fetch(`${baseUrl}/api/admin/materials/${materialId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(deleteResponse.status, 409, 'A material linked to an existing evaluation must not be deleted');
    const deleteBody = await deleteResponse.json() as any;
    assert.equal(deleteBody.code, 'MATERIAL_IN_USE_BY_EVALUATIONS');
    assert.equal(Number(deleteBody.linkedEvaluations), 1);
    assert.ok(
      db.prepare('SELECT id FROM evaluation_materials WHERE id = ?').get(materialId),
      'Linked historical source remains in the material library'
    );

    console.log('✅ Historical recovery source test passed: inactive exact source resolves and linked hard-delete is blocked.');
  } finally {
    db.prepare('DELETE FROM evaluations WHERE id = ?').run(evaluationId);
    db.prepare('DELETE FROM evaluation_materials WHERE id = ?').run(materialId);
    db.prepare('DELETE FROM users WHERE id = ?').run(studentId);
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

run().catch((error) => {
  console.error('❌ Historical evaluation material recovery test failed:', error);
  process.exitCode = 1;
});
