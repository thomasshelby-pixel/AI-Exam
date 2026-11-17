import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { db, initDatabase } from '../db.js';
import { generateToken } from '../auth.js';
import adminRoutes from '../routes/adminRoutes.js';

async function run() {
  initDatabase();

  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const studentId = `usr_needs_review_reprocess_${suffix}`;
  const evaluationId = `eval_needs_review_reprocess_${suffix}`;
  const email = `needs_review_reprocess_${suffix}@example.com`;
  const missingMaterialId = `missing_exact_material_${suffix}`;
  const uploadsDir = path.join(process.cwd(), 'uploads');
  const originalPath = path.join(uploadsDir, `${evaluationId}_original.pdf`);
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
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  try {
    db.prepare(`
      INSERT INTO users (
        id, email, password_hash, full_name, role, status, email_verified, account_classification
      ) VALUES (?, ?, 'test-hash', 'Needs Review Reprocess Student', 'STUDENT', 'ACTIVE', 1, 'NORMAL')
    `).run(studentId, email);

    const originalResultJson = JSON.stringify({
      questions: [],
      validationStatus: 'NEEDS_REVIEW',
      validationErrors: ['NO_QUESTION_LEVEL_EVALUATIONS: diagnostic-only result'],
    });

    db.prepare(`
      INSERT INTO evaluations (
        id, student_id, level, material_type, subject_key, subject_name, paper, attempt,
        material_id, material_version, original_filename, checking_mode,
        document_validation_status, status, certification_status, downloads_unlocked,
        total_marks, maximum_marks, percentage, grade, result_json,
        entitlement_source, consumed_from_personal_credits
      ) VALUES (
        ?, ?, 'INTERMEDIATE', 'PYQ', 'test_subject_${suffix}', 'Test Subject',
        'Paper 5', 'May 2026', ?, '1.0', 'original.pdf', 'standard',
        'VALID', 'NEEDS_REVIEW', 'REVIEW_REQUIRED', 0,
        0, 100, 0, 'NEEDS_REVIEW', ?, 'PERSONAL_FREE', 0
      )
    `).run(evaluationId, studentId, missingMaterialId, originalResultJson);

    // The legacy safe-recovery action must continue to reject NEEDS_REVIEW unless
    // the administrator explicitly chooses the new reprocess mode.
    const legacyRecovery = await fetch(
      `${baseUrl}/api/admin/evaluations/${evaluationId}/recover`,
      { method: 'POST', headers, body: JSON.stringify({}) },
    );
    assert.equal(legacyRecovery.status, 409);
    const legacyBody = await legacyRecovery.json() as any;
    assert.equal(legacyBody.code, 'EVALUATION_NEEDS_REVIEW');

    // With no original answer sheet, the explicit action must fail before claiming
    // the evaluation, archiving/resetting its result, or changing entitlement state.
    const missingOriginalResponse = await fetch(
      `${baseUrl}/api/admin/evaluations/${evaluationId}/recover`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ mode: 'REPROCESS_NEEDS_REVIEW' }),
      },
    );
    assert.equal(missingOriginalResponse.status, 409);
    const missingOriginalBody = await missingOriginalResponse.json() as any;
    assert.equal(missingOriginalBody.code, 'ORIGINAL_PDF_UNAVAILABLE');

    // Once the original is available, a missing exact linked source still blocks
    // reprocessing. It must never substitute a different attempt or paper.
    fs.mkdirSync(uploadsDir, { recursive: true });
    fs.writeFileSync(originalPath, Buffer.from('%PDF-test-original'));
    const missingSourceResponse = await fetch(
      `${baseUrl}/api/admin/evaluations/${evaluationId}/recover`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ mode: 'REPROCESS_NEEDS_REVIEW' }),
      },
    );
    assert.equal(missingSourceResponse.status, 409);
    const missingSourceBody = await missingSourceResponse.json() as any;
    assert.equal(missingSourceBody.code, 'EXACT_REFERENCE_MATERIAL_UNAVAILABLE');

    const after = db.prepare('SELECT * FROM evaluations WHERE id = ?').get(evaluationId) as any;
    assert.equal(after.status, 'NEEDS_REVIEW', 'Failed preflight must preserve the review status.');
    assert.equal(after.result_json, originalResultJson, 'Failed preflight must preserve the previous result JSON.');
    assert.equal(Number(after.downloads_unlocked || 0), 0, 'Student downloads remain locked.');
    assert.equal(Number(after.consumed_from_personal_credits || 0), 0, 'No new personal credit is consumed.');
    assert.equal(
      Number(db.prepare(`
        SELECT COUNT(*) AS count FROM audit_logs
        WHERE entity_id = ? AND action = 'EVALUATION_REPROCESS_STARTED'
      `).get(evaluationId)?.count || 0),
      0,
      'A reprocess audit snapshot is written only after all preflight inputs are verified.',
    );

    // A previous request may have left the SQLite RECOVERY_CLAIMED marker behind
    // while the evaluation is still NEEDS_REVIEW and no active worker/Firestore
    // lease exists (the route checks both before this atomic SQL compare-and-set).
    // An explicit reprocess may reclaim that orphan marker exactly once.
    // Legacy/hydrated records may contain lower-case status values even though
    // the Admin API normalizes them to upper-case before deciding eligibility.
    // The atomic claim must normalize the stored status as well.
    db.prepare(`
      UPDATE evaluations
      SET status = 'needs_review', progress_stage = 'RECOVERY_CLAIMED', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(evaluationId);

    const staleClaimReclaimed = db.prepare(`
      UPDATE evaluations
      SET status = 'QUEUED', progress_stage = 'RECOVERY_CLAIMED', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND ((? = 0 AND UPPER(TRIM(COALESCE(status, ''))) IN ('QUEUED', 'PROCESSING')) OR (? = 1 AND UPPER(TRIM(COALESCE(status, ''))) = 'NEEDS_REVIEW'))
        AND ((? = 1 AND UPPER(TRIM(COALESCE(status, ''))) = 'NEEDS_REVIEW')
          OR COALESCE(progress_stage, '') <> 'RECOVERY_CLAIMED'
          OR updated_at < datetime('now', '-2 minutes')
          OR updated_at IS NULL)
    `).run(evaluationId, 0, 1, 1);
    assert.equal(staleClaimReclaimed.changes, 1, 'An orphaned claim marker must not permanently trap NEEDS_REVIEW.');

    const duplicateClaim = db.prepare(`
      UPDATE evaluations
      SET status = 'QUEUED', progress_stage = 'RECOVERY_CLAIMED', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND ((? = 0 AND status IN ('QUEUED', 'PROCESSING')) OR (? = 1 AND status = 'NEEDS_REVIEW'))
        AND ((? = 1 AND status = 'NEEDS_REVIEW')
          OR COALESCE(progress_stage, '') <> 'RECOVERY_CLAIMED'
          OR updated_at < datetime('now', '-2 minutes')
          OR updated_at IS NULL)
    `).run(evaluationId, 0, 1, 1);
    assert.equal(duplicateClaim.changes, 0, 'A second simultaneous Admin request must lose once the first changes status to QUEUED.');

    console.log('✅ Admin NEEDS_REVIEW reprocess is fail-closed on missing inputs and safely reclaims orphaned locks exactly once.');
  } finally {
    try { fs.unlinkSync(originalPath); } catch {}
    try { db.prepare('DELETE FROM audit_logs WHERE entity_id = ?').run(evaluationId); } catch {}
    try { db.prepare('DELETE FROM evaluations WHERE id = ?').run(evaluationId); } catch {}
    try { db.prepare('DELETE FROM users WHERE id = ?').run(studentId); } catch {}
    server.close();
  }
}

run().catch((error) => {
  console.error('❌ Admin NEEDS_REVIEW reprocess regression failed:', error);
  process.exitCode = 1;
});
