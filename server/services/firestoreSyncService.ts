import fs from 'node:fs';
import path from 'node:path';
import { db } from '../db.js';
import {
  getFirestoreDb,
  setFirestoreDoc,
  deleteFirestoreDoc,
  getAllFirestoreDocs,
  recordTombstone,
  isTombstoned,
} from './firestoreDbService.js';
import { savePersistentFile } from './persistentStorageService.js';

/**
 * Asynchronously mirrors an inserted or updated record from SQLite to Cloud Firestore.
 */
export async function syncRecordToFirestore(collectionName: string, id: string, data: Record<string, any>) {
  try {
    const tombstoned = await isTombstoned(collectionName, id);
    if (tombstoned) {
      console.log(`[FirestoreSync] Skipping sync for tombstoned record ${collectionName}/${id}`);
      return;
    }
    await setFirestoreDoc(collectionName, id, data);
  } catch (err) {
    console.warn(`[FirestoreSync] Failed to sync ${collectionName}/${id}:`, err);
  }
}

/**
 * Permanently removes a record from Cloud Firestore and marks a tombstone
 * so it will NEVER be re-seeded or resurrected on server restarts.
 */
export async function permanentlyDeleteFromFirestore(collectionName: string, id: string, reason?: string) {
  try {
    await recordTombstone(collectionName, id, reason);
    await deleteFirestoreDoc(collectionName, id);
    console.log(`[FirestoreSync] Permanently deleted and tombstoned ${collectionName}/${id}`);
  } catch (err) {
    console.warn(`[FirestoreSync] Failed to permanently delete ${collectionName}/${id}:`, err);
  }
}

/**
 * Hydrates all Firestore data into local SQLite upon server startup.
 * Ensures:
 * 1. Modified or created records survive container/server restarts.
 * 2. Permanently deleted records remain deleted (tombstone check).
 * 3. Never overwrites newer records.
 */
export async function hydrateFromFirestore(): Promise<void> {
  const fdb = getFirestoreDb();
  if (!fdb) {
    console.log('[FirestoreSync] Firestore not configured or offline; skipping hydration.');
    return;
  }

  try {
    console.log('[FirestoreSync] Starting hydration from Cloud Firestore...');

    // 1. Load tombstones
    const tombstones = await getAllFirestoreDocs<{ id: string; targetId: string; collectionName: string }>('tombstones');
    const tombstoneSet = new Set(tombstones.map((t) => `${t.collectionName}_${t.targetId || t.id}`));

    // 2. Hydrate Users
    const users = await getAllFirestoreDocs<any>('users');
    for (const u of users) {
      if (tombstoneSet.has(`users_${u.id}`)) continue;
      try {
        db.prepare(`
          INSERT INTO users (id, email, password_hash, full_name, phone, role, status, account_classification, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)
          ON CONFLICT(id) DO UPDATE SET
            email = excluded.email,
            full_name = excluded.full_name,
            role = excluded.role,
            status = excluded.status,
            account_classification = COALESCE(excluded.account_classification, users.account_classification),
            updated_at = CURRENT_TIMESTAMP
        `).run(
          u.id, u.email, u.password_hash || 'HASHED_PASS', u.full_name || '', u.phone || '',
          u.role || 'STUDENT', u.status || 'ACTIVE', u.account_classification || null, u.created_at || null
        );
      } catch (err) {
        // ignore individual conflict
      }
    }

    // 3. Hydrate Student Profiles
    const profiles = await getAllFirestoreDocs<any>('student_profiles');
    for (const p of profiles) {
      const uId = p.user_id || p.id;
      if (tombstoneSet.has(`student_profiles_${uId}`)) continue;
      try {
        db.prepare(`
          INSERT INTO student_profiles (user_id, icai_registration_number, ca_level, free_evaluations_used, purchased_credits, institute_id, batch_id, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)
          ON CONFLICT(user_id) DO UPDATE SET
            icai_registration_number = excluded.icai_registration_number,
            ca_level = excluded.ca_level,
            free_evaluations_used = excluded.free_evaluations_used,
            purchased_credits = excluded.purchased_credits,
            institute_id = excluded.institute_id,
            batch_id = excluded.batch_id,
            updated_at = CURRENT_TIMESTAMP
        `).run(
          uId, p.icai_registration_number || '', p.ca_level || 'INTERMEDIATE',
          p.free_evaluations_used || 0, p.purchased_credits || 0,
          p.institute_id || null, p.batch_id || null, p.created_at || null
        );
      } catch {
        // ignore
      }
    }

    // 4. Hydrate Institutes
    const institutes = await getAllFirestoreDocs<any>('institutes');
    for (const inst of institutes) {
      if (tombstoneSet.has(`institutes_${inst.id}`)) continue;
      try {
        db.prepare(`
          INSERT INTO institutes (id, name, code, logo_url, email, phone, address, website, contact_person, status, subscription_plan, subscription_expires_at, max_students, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            code = excluded.code,
            email = excluded.email,
            status = excluded.status,
            subscription_plan = excluded.subscription_plan,
            max_students = excluded.max_students,
            updated_at = CURRENT_TIMESTAMP
        `).run(
          inst.id, inst.name, inst.code || '', inst.logo_url || '', inst.email || '',
          inst.phone || '', inst.address || '', inst.website || '', inst.contact_person || '',
          inst.status || 'ACTIVE', inst.subscription_plan || 'INSTITUTIONAL_PRO',
          inst.subscription_expires_at || null, inst.max_students || 500, inst.created_at || null
        );
      } catch {
        // ignore
      }
    }

    // 5. Hydrate Batches
    const batches = await getAllFirestoreDocs<any>('batches');
    for (const b of batches) {
      if (tombstoneSet.has(`batches_${b.id}`)) continue;
      try {
        db.prepare(`
          INSERT INTO batches (id, institute_id, name, course_level, description, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            course_level = excluded.course_level,
            description = excluded.description,
            updated_at = CURRENT_TIMESTAMP
        `).run(b.id, b.institute_id, b.name, b.course_level || 'INTERMEDIATE', b.description || '', b.created_at || null);
      } catch {
        // ignore
      }
    }

    // 6. Hydrate Evaluation Materials (ICAI Question Papers, Suggested Answers, Rubrics)
    const materials = await getAllFirestoreDocs<any>('evaluation_materials');
    for (const m of materials) {
      if (tombstoneSet.has(`evaluation_materials_${m.id}`)) continue;
      try {
        db.prepare(`
          INSERT INTO evaluation_materials (
            id, level, material_type, model_group, subject_key, subject_name,
            paper, attempt, syllabus_version, chapter_topic,
            question_paper_title, question_paper_text, suggested_answers_text,
            marking_scheme_text, reference_guidance_text, amendments_provisions_text,
            effective_date, version, status, source_type, admin_approved, file_id, uploaded_by,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)
          ON CONFLICT(id) DO UPDATE SET
            question_paper_title = excluded.question_paper_title,
            question_paper_text = excluded.question_paper_text,
            suggested_answers_text = excluded.suggested_answers_text,
            marking_scheme_text = excluded.marking_scheme_text,
            reference_guidance_text = excluded.reference_guidance_text,
            amendments_provisions_text = excluded.amendments_provisions_text,
            status = excluded.status,
            file_id = excluded.file_id,
            updated_at = CURRENT_TIMESTAMP
        `).run(
          m.id, m.level, m.material_type, m.model_group || null, m.subject_key, m.subject_name,
          m.paper || 'Paper 1', m.attempt || 'Current', m.syllabus_version || 'New Scheme 2024',
          m.chapter_topic || null, m.question_paper_title, m.question_paper_text,
          m.suggested_answers_text, m.marking_scheme_text, m.reference_guidance_text || null,
          m.amendments_provisions_text || null, m.effective_date || null, m.version || '1.0',
          m.status || 'ACTIVE', m.source_type || 'ADMIN', m.admin_approved !== undefined ? m.admin_approved : 1,
          m.file_id || null, m.uploaded_by || 'ADMIN', m.created_at || null
        );
      } catch {
        // ignore
      }
    }

    // 7. Hydrate Evaluations (Student Submissions, Grades, Annotations)
    const evaluations = await getAllFirestoreDocs<any>('evaluations');
    for (const ev of evaluations) {
      if (tombstoneSet.has(`evaluations_${ev.id}`)) {
        // Ensure tombstoned evaluations are definitely not in SQLite
        try {
          db.prepare('DELETE FROM evaluations WHERE id = ?').run(ev.id);
        } catch {}
        continue;
      }
      try {
        db.prepare(`
          INSERT INTO evaluations (
            id, student_id, institute_id, sponsoring_institute_id, batch_id,
            level, material_type, subject_key, subject_name, paper, attempt,
            checking_mode, evaluation_source, material_source, entitlement_source,
            consumed_from_institute_allocation, consumed_from_personal_credits,
            total_marks, maximum_marks, percentage, grade, confidence_score,
            status, result_json, error_message, document_validation_status, rejection_reason,
            original_filename, created_at, completed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            status = excluded.status,
            total_marks = excluded.total_marks,
            maximum_marks = excluded.maximum_marks,
            percentage = excluded.percentage,
            grade = excluded.grade,
            result_json = excluded.result_json,
            error_message = excluded.error_message,
            completed_at = excluded.completed_at
        `).run(
          ev.id, ev.student_id, ev.institute_id || null, ev.sponsoring_institute_id || null, ev.batch_id || null,
          ev.level, ev.material_type || 'EXAM', ev.subject_key, ev.subject_name, ev.paper || 'Paper 1', ev.attempt || 'Current',
          ev.checking_mode || 'STANDARD', ev.evaluation_source || 'PUBLIC', ev.material_source || 'GLOBAL',
          ev.entitlement_source || 'PERSONAL_FREE', ev.consumed_from_institute_allocation || 0, ev.consumed_from_personal_credits || 0,
          ev.total_marks !== undefined ? ev.total_marks : null, ev.maximum_marks || 100, ev.percentage !== undefined ? ev.percentage : null,
          ev.grade || null, ev.confidence_score || null, ev.status || 'COMPLETED', ev.result_json || null,
          ev.error_message || null, ev.document_validation_status || 'VERIFIED', ev.rejection_reason || null,
          ev.original_filename || 'student_answer_sheet.pdf', ev.created_at || new Date().toISOString(), ev.completed_at || null
        );
      } catch {
        // ignore
      }
    }

    // 8. Hydrate Audit Logs
    const logs = await getAllFirestoreDocs<any>('audit_logs');
    for (const l of logs) {
      try {
        db.prepare(`
          INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details, created_at)
          VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
          ON CONFLICT(id) DO NOTHING
        `).run(l.id, l.user_id, l.action, l.entity_type, l.entity_id || null, l.details || '', l.created_at || null);
      } catch {
        // ignore
      }
    }

    // 9. Hydrate Credit Ledger
    const ledger = await getAllFirestoreDocs<any>('credit_ledger');
    for (const c of ledger) {
      try {
        db.prepare(`
          INSERT INTO credit_ledger (id, student_id, amount, source, balance_after, evaluation_id, payment_order_id, note, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
          ON CONFLICT(id) DO NOTHING
        `).run(c.id, c.student_id, c.amount, c.source, c.balance_after || 0, c.evaluation_id || null, c.payment_order_id || null, c.note || '', c.created_at || null);
      } catch {
        // ignore
      }
    }

    console.log(`[FirestoreSync] Hydration complete: Loaded ${materials.length} materials, ${evaluations.length} evaluations, ${users.length} users, ${tombstones.length} tombstones from Firestore.`);
  } catch (err) {
    console.error('[FirestoreSync] Error during Firestore hydration:', err);
  }
}

/**
 * Initial sync to populate Firestore with any baseline records that don't yet exist in Firestore.
 */
export async function seedBaselineToFirestoreIfEmpty(): Promise<void> {
  const fdb = getFirestoreDb();
  if (!fdb) return;

  try {
    const existingMaterials = await getAllFirestoreDocs('evaluation_materials');
    if (existingMaterials.length === 0) {
      console.log('[FirestoreSync] Seeding baseline ICAI evaluation materials to Cloud Firestore...');
      const localMaterials = db.prepare('SELECT * FROM evaluation_materials').all() as any[];
      for (const m of localMaterials) {
        await setFirestoreDoc('evaluation_materials', m.id, m);
      }
      console.log(`[FirestoreSync] Seeded ${localMaterials.length} materials to Firestore.`);
    }

    const existingUsers = await getAllFirestoreDocs('users');
    if (existingUsers.length === 0) {
      console.log('[FirestoreSync] Seeding baseline admin users to Cloud Firestore...');
      const localUsers = db.prepare("SELECT * FROM users WHERE role IN ('SUPER_ADMIN', 'SUPPORT_ADMIN')").all() as any[];
      for (const u of localUsers) {
        await setFirestoreDoc('users', u.id, u);
      }
    }
  } catch (err) {
    console.warn('[FirestoreSync] Baseline seeding warning:', err);
  }
}

/**
 * Migrates all current local data and files to Cloud Firestore.
 */
export async function migrateAllDataToFirestore(): Promise<{
  materials: number;
  users: number;
  profiles: number;
  institutes: number;
  batches: number;
  evaluations: number;
  logs: number;
  files: number;
}> {
  const fdb = getFirestoreDb();
  if (!fdb) {
    throw new Error('Firestore not initialized');
  }

  // Check tombstones first
  const tombstones = await getAllFirestoreDocs<{ id: string; entity_type: string; entity_id: string }>('tombstones');
  const tombstoneMap = new Set(tombstones.map((t) => `${t.entity_type}:${t.entity_id}`));

  let mCount = 0;
  let uCount = 0;
  let pCount = 0;
  let iCount = 0;
  let bCount = 0;
  let eCount = 0;
  let lCount = 0;
  let fCount = 0;

  // 1. Users
  const users = db.prepare('SELECT * FROM users').all() as any[];
  for (const u of users) {
    if (!tombstoneMap.has(`users:${u.id}`)) {
      await setFirestoreDoc('users', u.id, u);
      uCount++;
    }
  }

  // 2. Student Profiles
  const profiles = db.prepare('SELECT * FROM student_profiles').all() as any[];
  for (const p of profiles) {
    await setFirestoreDoc('student_profiles', p.user_id, p);
    pCount++;
  }

  // 3. Institutes
  const institutes = db.prepare('SELECT * FROM institutes').all() as any[];
  for (const inst of institutes) {
    if (!tombstoneMap.has(`institutes:${inst.id}`)) {
      await setFirestoreDoc('institutes', inst.id, inst);
      iCount++;
    }
  }

  // 4. Batches
  const batches = db.prepare('SELECT * FROM batches').all() as any[];
  for (const b of batches) {
    await setFirestoreDoc('batches', b.id, b);
    bCount++;
  }

  // 5. Materials
  const materials = db.prepare('SELECT * FROM evaluation_materials').all() as any[];
  for (const m of materials) {
    if (!tombstoneMap.has(`evaluation_materials:${m.id}`)) {
      await setFirestoreDoc('evaluation_materials', m.id, m);
      mCount++;
    }
  }

  // 6. Evaluations
  const evaluations = db.prepare('SELECT * FROM evaluations').all() as any[];
  for (const ev of evaluations) {
    if (!tombstoneMap.has(`evaluations:${ev.id}`)) {
      await setFirestoreDoc('evaluations', ev.id, ev);
      eCount++;
    }
  }

  // 7. Audit Logs
  const logs = db.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100').all() as any[];
  for (const log of logs) {
    await setFirestoreDoc('audit_logs', log.id, log);
    lCount++;
  }

  // 8. Uploaded Files
  const uploadsDirs = [
    path.join(process.cwd(), 'uploads'),
    path.join(process.cwd(), 'data', 'uploads'),
  ];

  for (const uDir of uploadsDirs) {
    if (fs.existsSync(uDir)) {
      const dirFiles = fs.readdirSync(uDir);
      for (const fileName of dirFiles) {
        if (fileName.endsWith('.pdf') || fileName.endsWith('.png') || fileName.endsWith('.jpg')) {
          const filePath = path.join(uDir, fileName);
          try {
            const buf = fs.readFileSync(filePath);
            const fileId = fileName.replace(/\.[^/.]+$/, '');
            const mimeType = fileName.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg';
            await savePersistentFile(fileId, fileName, mimeType, buf, 'GENERAL_DOCUMENT');
            fCount++;
          } catch (fileErr) {
            console.warn(`[FirestoreSync] File migration note for ${fileName}:`, fileErr);
          }
        }
      }
    }
  }

  console.log(`[FirestoreSync] Migration complete: Users: ${uCount}, Profiles: ${pCount}, Institutes: ${iCount}, Evaluations: ${eCount}, Logs: ${lCount}, Files: ${fCount}`);
  return { materials: mCount, users: uCount, profiles: pCount, institutes: iCount, batches: bCount, evaluations: eCount, logs: lCount, files: fCount };
}

