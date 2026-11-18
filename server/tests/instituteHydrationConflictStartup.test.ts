import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { db, initDatabase } from '../db.js';
import {
  hydrateInstituteRecordFromFirestore,
  hydrateInstituteBatchRecordFromFirestore,
} from '../services/firestoreSyncService.js';

function run() {
  initDatabase();
  db.exec('PRAGMA foreign_keys = ON;');

  const suffix = crypto.randomBytes(6).toString('hex');
  const instituteId = `inst_hydration_recovery_${suffix}`;
  const batchId = `batch_hydration_recovery_${suffix}`;
  const email = `hydration-${suffix}@example.test`;
  const code = `HYD-${suffix.toUpperCase()}`;

  try {
    // A valid institute and batch still hydrate normally.
    assert.equal(hydrateInstituteRecordFromFirestore({
      id: instituteId,
      name: 'Hydration Regression Institute',
      code,
      email,
      phone: '9999999999',
      contact_person: 'Test Admin',
      status: 'ACTIVE',
      subscription_plan: 'INSTITUTIONAL_PRO',
      max_students: 50,
    }), true);

    assert.equal(hydrateInstituteBatchRecordFromFirestore({
      id: batchId,
      institute_id: instituteId,
      name: 'Hydration Regression Batch',
      course_level: 'INTERMEDIATE',
      description: 'Test batch',
    }), true);

    // A different cloud ID with an already-owned unique email is quarantined.
    // It must not replace the existing institute or crash production startup.
    assert.equal(hydrateInstituteRecordFromFirestore({
      id: `inst_duplicate_email_${suffix}`,
      name: 'Conflicting Institute',
      code: `DUP-${suffix.toUpperCase()}`,
      email,
      phone: '8888888888',
      contact_person: 'Different Admin',
      status: 'ACTIVE',
      subscription_plan: 'INSTITUTIONAL_PRO',
      max_students: 50,
    }), false);

    const persisted = db.prepare('SELECT id, name, code, email FROM institutes WHERE email = ?').get(email) as any;
    assert.equal(persisted?.id, instituteId);
    assert.equal(persisted?.name, 'Hydration Regression Institute');

    // A batch whose parent institute is absent is also quarantined.
    assert.equal(hydrateInstituteBatchRecordFromFirestore({
      id: `batch_orphan_${suffix}`,
      institute_id: `inst_missing_parent_${suffix}`,
      name: 'Orphan Batch',
      course_level: 'INTERMEDIATE',
      description: 'This must not abort Cloud Run startup',
    }), false);

    const orphan = db.prepare('SELECT id FROM batches WHERE id = ?').get(`batch_orphan_${suffix}`);
    assert.equal(orphan, undefined);

    console.log('PASS: malformed, duplicate and orphan institute records are quarantined without aborting startup.');
  } finally {
    db.prepare('DELETE FROM batches WHERE institute_id = ?').run(instituteId);
    db.prepare('DELETE FROM institutes WHERE id = ?').run(instituteId);
  }
}

try {
  run();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
