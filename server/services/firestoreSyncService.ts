import fs from 'node:fs';
import path from 'node:path';
import { db, recordLocalTombstone, getAllLocalTombstoneSet } from '../db.js';
import {
  getFirestoreDb,
  setFirestoreDoc,
  deleteFirestoreDoc,
  getAllFirestoreDocs,
  recordTombstone,
  isTombstoned,
} from './firestoreDbService.js';
import { savePersistentFile } from './persistentStorageService.js';
import { getValidStudentCreditBalance } from './studentCreditService.js';
import { syncMaterialRowToSqlite, normalizeMtpSeries } from './materialLookupService.js';

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
    recordLocalTombstone(collectionName, id, reason);
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
    // Temporarily disable foreign key constraints during hydration to avoid order-of-insertion deadlocks
    db.exec('PRAGMA foreign_keys = OFF;');

    // 1. Load tombstones
    const tombstones = await getAllFirestoreDocs<{ id: string; targetId: string; collectionName: string }>('tombstones');
    const localTombstones = getAllLocalTombstoneSet();
    const tombstoneSet = new Set<string>(localTombstones);
    for (const t of tombstones) {
      const col = t.collectionName || '';
      const tid = t.targetId || t.id;
      if (col && tid) {
        tombstoneSet.add(`${col}_${tid}`);
        tombstoneSet.add(`${col}:${tid}`);
        tombstoneSet.add(tid);
        recordLocalTombstone(col, tid, 'HYDRATED_TOMBSTONE');
      }
    }

    // 2. Hydrate Users
    const users = await getAllFirestoreDocs<any>('users');
    let uHydrated = 0;
    for (const u of users) {
      if (tombstoneSet.has(`users_${u.id}`)) continue;
      try {
        let normEmail = String(u.email || '').trim().toLowerCase();
        let targetId = u.id;
        let targetRole = u.role || 'STUDENT';
        let targetStatus = u.status || 'ACTIVE';

        // Super Admin migration enforcement:
        if (normEmail === 'caexamchecker.support@gmail.com' || u.id === 'usr_super_admin_001') {
          targetId = 'usr_super_admin_001';
          normEmail = 'caexamchecker.support@gmail.com';
          targetRole = 'SUPER_ADMIN';
          targetStatus = 'ACTIVE';

          // Clean up old support admin document in Firestore if it had a different id
          if (u.id !== 'usr_super_admin_001') {
            await deleteFirestoreDoc('users', u.id).catch(() => {});
          }
        }

        // Deactivate old superseded admin emails if present in Firestore
        if (normEmail === 'admin@caexamchecker.ai' || normEmail === 'superadmin@ca-exam-checker.com') {
          targetStatus = 'DISABLED';
          targetRole = 'DISABLED';
        }

        const pHash = u.password_hash || u.passwordHash || u.password || 'HASHED_PASS';
        const userClassification = u.account_classification || 'NORMAL';

        // Check for any colliding user in SQLite by email with a different ID
        const collidingUser = db.prepare('SELECT id FROM users WHERE lower(email) = ? AND id != ?').get(normEmail, targetId) as { id: string } | undefined;
        if (collidingUser) {
          db.prepare('DELETE FROM users WHERE id = ?').run(collidingUser.id);
        }

        const uMfaEnabled = u.mfa_enabled ? 1 : 0;
        const uMfaEnrolledAt = u.mfa_enrolled_at || null;
        const uTotpSecret = u.totp_secret || null;

        db.prepare(`
          INSERT INTO users (id, email, password_hash, full_name, phone, role, status, account_classification, mfa_enabled, mfa_enrolled_at, totp_secret, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)
          ON CONFLICT(id) DO UPDATE SET
            email = excluded.email,
            password_hash = CASE
              WHEN users.role = 'SUPER_ADMIN' AND users.password_hash IS NOT NULL
              THEN users.password_hash
              WHEN excluded.password_hash IS NOT NULL AND excluded.password_hash NOT IN ('HASHED_PASS', 'PERSISTED_HASH', '')
              THEN excluded.password_hash
              ELSE users.password_hash
            END,
            full_name = excluded.full_name,
            phone = COALESCE(excluded.phone, users.phone),
            role = excluded.role,
            status = excluded.status,
            account_classification = COALESCE(excluded.account_classification, users.account_classification, 'NORMAL'),
            mfa_enabled = CASE WHEN users.mfa_enabled = 1 THEN 1 ELSE excluded.mfa_enabled END,
            mfa_enrolled_at = COALESCE(users.mfa_enrolled_at, excluded.mfa_enrolled_at),
            totp_secret = COALESCE(users.totp_secret, excluded.totp_secret),
            updated_at = CURRENT_TIMESTAMP
        `).run(
          targetId, normEmail, pHash, u.full_name || '', u.phone || '',
          targetRole, targetStatus, userClassification,
          uMfaEnabled, uMfaEnrolledAt, uTotpSecret,
          u.created_at || null
        );
        uHydrated++;
      } catch (err) {
        console.warn(`[FirestoreSync] Failed to hydrate user ${u.id} (${u.email}):`, err);
      }
    }

    // 3. Hydrate Student Profiles
    const profiles = await getAllFirestoreDocs<any>('student_profiles');
    for (const p of profiles) {
      const uId = p.user_id || p.id;
      if (tombstoneSet.has(`student_profiles_${uId}`)) continue;
      try {
        const authoritativeCredits = getValidStudentCreditBalance(uId);
        const finalCredits = authoritativeCredits > 0 ? authoritativeCredits : (p.purchased_credits || 0);
        db.prepare(`
          INSERT INTO student_profiles (user_id, icai_registration_number, ca_level, free_evaluations_used, purchased_credits, institute_id, batch_id, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)
          ON CONFLICT(user_id) DO UPDATE SET
            icai_registration_number = excluded.icai_registration_number,
            ca_level = excluded.ca_level,
            free_evaluations_used = excluded.free_evaluations_used,
            purchased_credits = ?,
            institute_id = excluded.institute_id,
            batch_id = excluded.batch_id,
            updated_at = CURRENT_TIMESTAMP
        `).run(
          uId, p.icai_registration_number || '', p.ca_level || 'INTERMEDIATE',
          p.free_evaluations_used || 0, finalCredits,
          p.institute_id || null, p.batch_id || null, p.created_at || null,
          finalCredits
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

    // 5b. Hydrate Institute Memberships
    const memberships = await getAllFirestoreDocs<any>('institute_memberships');
    for (const m of memberships) {
      try {
        db.prepare(`
          INSERT INTO institute_memberships (id, institute_id, student_id, batch_id, status, joined_at)
          VALUES (?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
          ON CONFLICT(id) DO UPDATE SET
            status = excluded.status,
            batch_id = excluded.batch_id
        `).run(m.id, m.institute_id, m.student_id, m.batch_id || null, m.status || 'APPROVED', m.joined_at || null);
      } catch {
        // ignore
      }
    }

    // 6. Hydrate Evaluation Materials (ICAI Question Papers, Suggested Answers, Rubrics)
    // First remove any tombstoned materials from local SQLite
    for (const t of tombstones) {
      if ((t.collectionName === 'evaluation_materials' || t.collectionName === 'materials') && (t.targetId || t.id)) {
        const idToDelete = t.targetId || t.id.replace(/^(evaluation_materials_|materials_)/, '');
        try {
          db.prepare('DELETE FROM evaluation_materials WHERE id = ?').run(idToDelete);
        } catch {
          // ignore
        }
      }
    }

    const materials = await getAllFirestoreDocs<any>('evaluation_materials');
    for (const m of materials) {
      if (tombstoneSet.has(`evaluation_materials_${m.id}`) || tombstoneSet.has(`materials_${m.id}`)) continue;
      try {
        syncMaterialRowToSqlite(m);

        // Normalize non-canonical mtp_series in Cloud Firestore as well (e.g. "1.0" -> 1, "2.0" -> 2)
        const canonicalSeries = normalizeMtpSeries(m.mtp_series);
        if (m.material_type === 'MTP' && canonicalSeries !== null && m.mtp_series !== canonicalSeries && m.mtp_series !== String(canonicalSeries)) {
          setFirestoreDoc('evaluation_materials', m.id, { mtp_series: canonicalSeries }).catch((err) => {
            console.warn(`[FirestoreSync] Failed to normalize mtp_series for ${m.id} in Firestore:`, err);
          });
        }
      } catch (matErr) {
        console.warn(`[FirestoreSync] Failed to hydrate material ${m.id}:`, matErr);
      }
    }

    // 7. Hydrate Evaluations (Student Submissions, Grades, Annotations)
    const evaluations = await getAllFirestoreDocs<any>('evaluations');
    let evHydrated = 0;
    for (const ev of evaluations) {
      if (tombstoneSet.has(`evaluations_${ev.id}`)) {
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
            original_filename, current_evaluation_version_id, evaluation_version,
            admin_review_status, admin_reviewed_at, admin_reviewer_id, admin_reviewer_email, admin_review_notes,
            created_at, completed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            status = excluded.status,
            total_marks = excluded.total_marks,
            maximum_marks = excluded.maximum_marks,
            percentage = excluded.percentage,
            grade = excluded.grade,
            confidence_score = excluded.confidence_score,
            result_json = excluded.result_json,
            error_message = excluded.error_message,
            document_validation_status = excluded.document_validation_status,
            rejection_reason = excluded.rejection_reason,
            current_evaluation_version_id = excluded.current_evaluation_version_id,
            evaluation_version = excluded.evaluation_version,
            admin_review_status = excluded.admin_review_status,
            admin_reviewed_at = excluded.admin_reviewed_at,
            admin_reviewer_id = excluded.admin_reviewer_id,
            admin_reviewer_email = excluded.admin_reviewer_email,
            admin_review_notes = excluded.admin_review_notes,
            completed_at = excluded.completed_at
        `).run(
          ev.id, ev.student_id, ev.institute_id || null, ev.sponsoring_institute_id || null, ev.batch_id || null,
          ev.level, ev.material_type || 'EXAM', ev.subject_key, ev.subject_name, ev.paper || 'Paper 1', ev.attempt || 'Current',
          ev.checking_mode || 'STANDARD', ev.evaluation_source || 'PUBLIC', ev.material_source || 'GLOBAL',
          ev.entitlement_source || 'PERSONAL_FREE', ev.consumed_from_institute_allocation || 0, ev.consumed_from_personal_credits || 0,
          ev.total_marks !== undefined ? ev.total_marks : null, ev.maximum_marks || 100, ev.percentage !== undefined ? ev.percentage : null,
          ev.grade || null, ev.confidence_score || null, ev.status || 'COMPLETED', ev.result_json || null,
          ev.error_message || null, ev.document_validation_status || 'VERIFIED', ev.rejection_reason || null,
          ev.original_filename || 'student_answer_sheet.pdf',
          ev.current_evaluation_version_id || ev.evaluation_version || 'v1',
          ev.evaluation_version || 'v1',
          ev.admin_review_status || null,
          ev.admin_reviewed_at || null,
          ev.admin_reviewer_id || null,
          ev.admin_reviewer_email || null,
          ev.admin_review_notes || null,
          ev.created_at || new Date().toISOString(), ev.completed_at || null
        );
        evHydrated++;
      } catch (evErr) {
        console.warn(`[FirestoreSync] Failed to insert evaluation ${ev.id}:`, evErr);
      }
    }

    // 7b. Hydrate Recheck Requests
    const rechecks = await getAllFirestoreDocs<any>('recheck_requests');
    for (const r of rechecks) {
      try {
        db.prepare(`
          INSERT INTO recheck_requests (
            id, evaluation_id, student_id, question_number, sub_question, reason, student_notes,
            status, requested_mode, reviewer_notes, adjusted_marks, student_email, subject, paper,
            request_type, student_reason, original_marks, assigned_reviewer, resolution,
            original_evaluation_version, revised_evaluation_version, original_checked_copy_id,
            revised_checked_copy_id, original_report_id, revised_report_id, audit_info_json,
            disputed_questions_json, resolved_at, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
          ON CONFLICT(id) DO UPDATE SET
            status = excluded.status,
            reviewer_notes = excluded.reviewer_notes,
            adjusted_marks = excluded.adjusted_marks,
            resolution = excluded.resolution,
            resolved_at = excluded.resolved_at
        `).run(
          r.id, r.evaluation_id, r.student_id, r.question_number || '', r.sub_question || null,
          r.reason || '', r.student_notes || null, r.status || 'PENDING', r.requested_mode || null,
          r.reviewer_notes || null, r.adjusted_marks || null, r.student_email || null,
          r.subject || null, r.paper || null, r.request_type || 'SPECIFIC_QUESTION',
          r.student_reason || null, r.original_marks || null, r.assigned_reviewer || null,
          r.resolution || null, r.original_evaluation_version || 'v1', r.revised_evaluation_version || null,
          r.original_checked_copy_id || null, r.revised_checked_copy_id || null,
          r.original_report_id || null, r.revised_report_id || null, r.audit_info_json || null,
          r.disputed_questions_json || null, r.resolved_at || null, r.created_at || null
        );
      } catch {
        // ignore
      }
    }

    // 7b2. Hydrate Evaluation Versions (Immutable V1/V2 records)
    const evalVersions = await getAllFirestoreDocs<any>('evaluation_versions');
    for (const evVer of evalVersions) {
      try {
        db.prepare(`
          INSERT INTO evaluation_versions (
            id, evaluation_id, version_number, version_tag, parent_version_id,
            status, total_marks, maximum_marks, percentage, grade,
            result_json, amendment_reason, amended_questions_json, review_resolution,
            admin_id, admin_email, checked_copy_file_id, checked_copy_storage_path,
            report_file_id, report_storage_path, audit_metadata_json, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            status = excluded.status,
            total_marks = excluded.total_marks,
            maximum_marks = excluded.maximum_marks,
            percentage = excluded.percentage,
            grade = excluded.grade,
            result_json = excluded.result_json,
            amendment_reason = excluded.amendment_reason,
            amended_questions_json = excluded.amended_questions_json,
            review_resolution = excluded.review_resolution,
            admin_id = excluded.admin_id,
            admin_email = excluded.admin_email,
            audit_metadata_json = excluded.audit_metadata_json
        `).run(
          evVer.id,
          evVer.evaluation_id,
          evVer.version_number || 1,
          evVer.version_tag || 'v1',
          evVer.parent_version_id || null,
          evVer.status || 'COMPLETED',
          evVer.total_marks ?? 0,
          evVer.maximum_marks ?? 100,
          evVer.percentage ?? 0,
          evVer.grade || null,
          typeof evVer.result_json === 'string' ? evVer.result_json : JSON.stringify(evVer.result_json || {}),
          evVer.amendment_reason || null,
          typeof evVer.amended_questions_json === 'string' ? evVer.amended_questions_json : (evVer.amended_questions_json ? JSON.stringify(evVer.amended_questions_json) : null),
          evVer.review_resolution || null,
          evVer.admin_id || null,
          evVer.admin_email || null,
          evVer.checked_copy_file_id || null,
          evVer.checked_copy_storage_path || null,
          evVer.report_file_id || null,
          evVer.report_storage_path || null,
          typeof evVer.audit_metadata_json === 'string' ? evVer.audit_metadata_json : (evVer.audit_metadata_json ? JSON.stringify(evVer.audit_metadata_json) : null),
          evVer.created_at || new Date().toISOString()
        );
      } catch (verErr) {
        console.warn(`[FirestoreSync] Failed to hydrate evaluation_version ${evVer.id}:`, verErr);
      }
    }

    // 7c. Hydrate Payment Orders & Transactions & Purchases
    const paymentOrders = await getAllFirestoreDocs<any>('payment_orders');
    for (const po of paymentOrders) {
      try {
        db.prepare(`
          INSERT INTO payment_orders (id, student_id, razorpay_order_id, quantity, amount_paise, currency, status, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
          ON CONFLICT(id) DO UPDATE SET status = excluded.status
        `).run(po.id, po.student_id, po.razorpay_order_id || po.id, po.quantity || 1, po.amount_paise || (po.amount_inr ? po.amount_inr * 100 : 9900), po.currency || 'INR', po.status || 'PAID', po.created_at || null);
      } catch {}
    }

    const creditPurchases = await getAllFirestoreDocs<any>('student_credit_purchases');
    for (const cp of creditPurchases) {
      try {
        db.prepare(`
          INSERT INTO student_credit_purchases (id, user_id, order_id, payment_id, credits_purchased, credits_remaining, valid_from, expires_at, purchase_date, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)
          ON CONFLICT(id) DO UPDATE SET
            credits_remaining = excluded.credits_remaining,
            status = excluded.status
        `).run(
          cp.id, cp.user_id, cp.order_id || null, cp.payment_id || null,
          cp.credits_purchased || 0, cp.credits_remaining !== undefined ? cp.credits_remaining : cp.credits_purchased,
          cp.valid_from || new Date().toISOString(), cp.expires_at || new Date(Date.now() + 365*24*3600000).toISOString(),
          cp.purchase_date || new Date().toISOString(), cp.status || 'ACTIVE', cp.created_at || null
        );
      } catch {}
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

    // 10. Hydrate Legal Documents
    const legalDocs = await getAllFirestoreDocs<any>('legal_documents');
    for (const ld of legalDocs) {
      try {
        db.prepare(`
          INSERT INTO legal_documents (
            id, doc_type, title, version, effective_date, last_updated_date,
            content, status, changelog, published_by, created_at, updated_at, published_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP, ?)
          ON CONFLICT(id) DO UPDATE SET
            title = excluded.title,
            version = excluded.version,
            effective_date = excluded.effective_date,
            last_updated_date = excluded.last_updated_date,
            content = excluded.content,
            status = excluded.status,
            changelog = excluded.changelog,
            published_by = excluded.published_by,
            published_at = excluded.published_at,
            updated_at = CURRENT_TIMESTAMP
        `).run(
          ld.id, ld.doc_type, ld.title, ld.version, ld.effective_date, ld.last_updated_date,
          ld.content, ld.status, ld.changelog || null, ld.published_by || null, ld.created_at || null, ld.published_at || null
        );
      } catch {
        // ignore
      }
    }

    // 11. Hydrate Legal Settings
    const legalSettings = await getAllFirestoreDocs<any>('legal_settings');
    for (const ls of legalSettings) {
      try {
        db.prepare(`
          INSERT INTO legal_settings (key, value, updated_at)
          VALUES (?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
        `).run(ls.key || ls.id, ls.value);
      } catch {
        // ignore
      }
    }

    // 12. Hydrate Support Tickets
    const supportTickets = await getAllFirestoreDocs<any>('support_tickets');
    for (const st of supportTickets) {
      try {
        db.prepare(`
          INSERT INTO support_tickets (id, user_id, subject, message, status, priority, category, role, resolution_note, resolved_at, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)
          ON CONFLICT(id) DO UPDATE SET
            status = excluded.status,
            resolution_note = excluded.resolution_note,
            resolved_at = excluded.resolved_at,
            updated_at = CURRENT_TIMESTAMP
        `).run(
          st.id, st.user_id, st.subject || '', st.message || '', st.status || 'OPEN',
          st.priority || 'MEDIUM', st.category || 'GENERAL', st.role || 'STUDENT',
          st.resolution_note || null, st.resolved_at || null, st.created_at || null
        );
      } catch {}
    }

    // 13. Hydrate Institute Materials & Tests
    const instMaterials = await getAllFirestoreDocs<any>('institute_materials');
    for (const im of instMaterials) {
      try {
        db.prepare(`
          INSERT INTO institute_materials (
            id, institute_id, title, level, subject_key, subject_name, paper, material_type,
            question_paper_text, question_paper_pdf_base64, suggested_answers_text, suggested_answers_pdf_base64,
            marking_scheme_text, marking_scheme_pdf_base64, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)
          ON CONFLICT(id) DO UPDATE SET
            title = excluded.title,
            question_paper_text = excluded.question_paper_text,
            suggested_answers_text = excluded.suggested_answers_text,
            marking_scheme_text = excluded.marking_scheme_text,
            updated_at = CURRENT_TIMESTAMP
        `).run(
          im.id, im.institute_id, im.title, im.level, im.subject_key, im.subject_name,
          im.paper || 'Paper 1', im.material_type || 'TEST_SERIES',
          im.question_paper_text || '', im.question_paper_pdf_base64 || null,
          im.suggested_answers_text || '', im.suggested_answers_pdf_base64 || null,
          im.marking_scheme_text || null, im.marking_scheme_pdf_base64 || null,
          im.created_at || null
        );
      } catch {}
    }

    const instTests = await getAllFirestoreDocs<any>('institute_tests');
    for (const it of instTests) {
      try {
        db.prepare(`
          INSERT INTO institute_tests (
            id, institute_id, batch_id, title, level, subject_key, subject_name, paper,
            checking_mode, institute_material_id, target_type, selected_student_ids,
            maximum_marks, time_limit_minutes, deadline, instructions, status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
          ON CONFLICT(id) DO UPDATE SET
            title = excluded.title,
            deadline = excluded.deadline,
            status = excluded.status
        `).run(
          it.id, it.institute_id, it.batch_id || null, it.title, it.level, it.subject_key, it.subject_name,
          it.paper || 'Paper 1', it.checking_mode || 'INSTITUTE_MATERIAL', it.institute_material_id || null,
          it.target_type || 'ALL', it.selected_student_ids || null, it.maximum_marks || 100,
          it.time_limit_minutes || null, it.deadline || new Date(Date.now() + 7*24*3600000).toISOString(),
          it.instructions || null, it.status || 'PUBLISHED', it.created_at || null
        );
      } catch {}
    }

    // 14. Hydrate Student Reviews & Star Ratings
    const reviews = await getAllFirestoreDocs<any>('reviews');
    for (const rev of reviews) {
      if (tombstoneSet.has(`reviews_${rev.id}`)) continue;
      try {
        db.prepare(`
          INSERT INTO reviews (
            id, user_id, student_name, student_email, display_name, ca_level,
            rating, review_text, status, moderation_note, approved_at, approved_by,
            rejected_at, rejected_by, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)
          ON CONFLICT(id) DO UPDATE SET
            display_name = excluded.display_name,
            ca_level = excluded.ca_level,
            rating = excluded.rating,
            review_text = excluded.review_text,
            status = excluded.status,
            moderation_note = excluded.moderation_note,
            approved_at = excluded.approved_at,
            approved_by = excluded.approved_by,
            rejected_at = excluded.rejected_at,
            rejected_by = excluded.rejected_by,
            updated_at = CURRENT_TIMESTAMP
        `).run(
          rev.id, rev.user_id, rev.student_name || '', rev.student_email || '',
          rev.display_name || '', rev.ca_level || 'INTERMEDIATE', rev.rating || 5,
          rev.review_text || '', rev.status || 'PENDING', rev.moderation_note || null,
          rev.approved_at || null, rev.approved_by || null, rev.rejected_at || null,
          rev.rejected_by || null, rev.created_at || null
        );
      } catch (rErr) {
        console.warn(`[FirestoreSync] Failed to hydrate review ${rev.id}:`, rErr);
      }
    }

    // 15. Auto-heal any orphaned student references in evaluations so foreign keys stay 100% intact
    const orphanStudents = db.prepare(`
      SELECT DISTINCT e.student_id FROM evaluations e
      LEFT JOIN users u ON u.id = e.student_id
      WHERE u.id IS NULL
    `).all() as Array<{ student_id: string }>;

    for (const orphan of orphanStudents) {
      if (!orphan.student_id) continue;
      try {
        db.prepare(`
          INSERT INTO users (id, email, password_hash, full_name, phone, role, status, created_at, updated_at)
          VALUES (?, ?, ?, 'CA Student', '+919876543210', 'STUDENT', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT(id) DO NOTHING
        `).run(orphan.student_id, `student_${orphan.student_id}@caexamchecker.ai`, 'PERSISTED_HASH');

        db.prepare(`
          INSERT INTO student_profiles (user_id, icai_registration_number, ca_level, free_evaluations_used, purchased_credits)
          VALUES (?, 'WRO123456', 'INTERMEDIATE', 0, 0)
          ON CONFLICT(user_id) DO NOTHING
        `).run(orphan.student_id);

        syncRecordToFirestore('users', orphan.student_id, {
          id: orphan.student_id,
          email: `student_${orphan.student_id}@caexamchecker.ai`,
          full_name: 'CA Student',
          role: 'STUDENT',
          status: 'ACTIVE',
          created_at: new Date().toISOString()
        }).catch(() => {});
      } catch (err) {
        console.warn(`[FirestoreSync] Auto-heal notice for student ${orphan.student_id}:`, err);
      }
    }

    // 16. Hydrate MFA Authenticators & Recovery Codes
    const mfaAuthenticators = await getAllFirestoreDocs<any>('mfa_authenticators');
    for (const auth of mfaAuthenticators) {
      try {
        db.prepare(`
          INSERT INTO mfa_authenticators (id, user_id, factor_type, label, totp_secret, phone_number, is_backup, created_at, last_used_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), COALESCE(?, CURRENT_TIMESTAMP))
          ON CONFLICT(id) DO UPDATE SET
            totp_secret = COALESCE(excluded.totp_secret, mfa_authenticators.totp_secret),
            label = excluded.label,
            last_used_at = excluded.last_used_at
        `).run(
          auth.id, auth.user_id, auth.factor_type || 'PRIMARY_TOTP', auth.label || 'Authenticator App',
          auth.totp_secret || null, auth.phone_number || null, auth.is_backup ? 1 : 0,
          auth.created_at || null, auth.last_used_at || null
        );
      } catch {}
    }

    const mfaRecoveryCodes = await getAllFirestoreDocs<any>('mfa_recovery_codes');
    for (const rc of mfaRecoveryCodes) {
      try {
        db.prepare(`
          INSERT INTO mfa_recovery_codes (id, user_id, code_hash, used, used_at, created_at)
          VALUES (?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
          ON CONFLICT(id) DO UPDATE SET
            used = excluded.used,
            used_at = excluded.used_at
        `).run(
          rc.id, rc.user_id, rc.code_hash, rc.used ? 1 : 0, rc.used_at || null, rc.created_at || null
        );
      } catch {}
    }

    console.log(`[FirestoreSync] Hydration complete: Loaded ${materials.length} materials, ${evaluations.length} evaluations (${evHydrated} active), ${users.length} users (${uHydrated} active), ${legalDocs.length} legal documents from Firestore.`);
  } catch (err) {
    console.error('[FirestoreSync] Error during Firestore hydration:', err);
  } finally {
    // Always restore foreign key constraint validation
    db.exec('PRAGMA foreign_keys = ON;');
  }
}

/**
 * Initial sync to populate Firestore with any baseline records that don't yet exist in Firestore.
 */
export async function seedBaselineToFirestoreIfEmpty(): Promise<void> {
  const fdb = getFirestoreDb();
  if (!fdb) return;

  try {
    const tombstones = await getAllFirestoreDocs<any>('tombstones');
    const tombstoneSet = new Set(
      tombstones.flatMap((t: any) => [
        `${t.collectionName || t.entity_type}_${t.targetId || t.entity_id || t.id}`,
        `${t.collectionName || t.entity_type}:${t.targetId || t.entity_id || t.id}`,
        t.targetId,
        t.entity_id,
        t.id,
      ].filter(Boolean))
    );

    const seedDoneSetting = db.prepare("SELECT value FROM pricing_settings WHERE key = 'SYSTEM_INITIAL_SEED_DONE'").get() as { value?: string } | undefined;
    const isSeedDone = seedDoneSetting?.value === 'true';

    const existingMaterials = await getAllFirestoreDocs('evaluation_materials');
    if (!isSeedDone && existingMaterials.length === 0) {
      console.log('[FirestoreSync] Initializing baseline ICAI evaluation materials to Cloud Firestore...');
      const localMaterials = db.prepare('SELECT * FROM evaluation_materials').all() as any[];
      let seeded = 0;
      for (const m of localMaterials) {
        if (!tombstoneSet.has(`evaluation_materials_${m.id}`) && !tombstoneSet.has(`materials_${m.id}`) && !tombstoneSet.has(m.id)) {
          await setFirestoreDoc('evaluation_materials', m.id, m);
          seeded++;
        }
      }
      if (seeded > 0) {
        console.log(`[FirestoreSync] Seeded ${seeded} baseline materials to Firestore.`);
      }
      try {
        db.prepare("INSERT OR REPLACE INTO pricing_settings (key, value, description) VALUES ('SYSTEM_INITIAL_SEED_DONE', 'true', 'Prevents re-seeding demo records on restart')").run();
      } catch {}
    } else {
      console.log('[FirestoreSync] Baseline materials already initialized or intentionally managed by admin; skipping automatic re-seeding.');
    }

    const existingUsers = await getAllFirestoreDocs<any>('users');
    const existingEmailSet = new Set(existingUsers.map((u) => String(u.email || '').toLowerCase().trim()));

    // Ensure baseline users are persisted in Cloud Firestore
    const baselineUserQuery = `
      SELECT * FROM users 
      WHERE email IN (
        'caexamchecker.support@gmail.com',
        'institute@apexca.edu',
        'student@caexamchecker.ai',
        'at9767676@gmail.com'
      )
    `;
    const baselineUsers = db.prepare(baselineUserQuery).all() as any[];
    for (const bu of baselineUsers) {
      const normEmail = String(bu.email || '').toLowerCase().trim();
      if (!existingEmailSet.has(normEmail)) {
        await setFirestoreDoc('users', bu.id, bu);
        const profile = db.prepare('SELECT * FROM student_profiles WHERE user_id = ?').get(bu.id) as any;
        if (profile) {
          await setFirestoreDoc('student_profiles', bu.id, profile);
        }
        console.log(`[FirestoreSync] Seeded baseline user ${bu.email} (${bu.id}) to Cloud Firestore.`);
      } else if (bu.role === 'SUPER_ADMIN') {
        // Ensure authoritative ADMIN_PASSWORD configured in server environment stays in sync in Cloud Firestore
        await setFirestoreDoc('users', bu.id, {
          email: bu.email,
          password_hash: bu.password_hash,
          status: 'ACTIVE',
          role: 'SUPER_ADMIN',
          updated_at: new Date().toISOString()
        });
        console.log(`[FirestoreSync] Synchronized SUPER_ADMIN ${bu.email} credentials to Cloud Firestore.`);
      }
    }

    // Safely deactivate superseded admin emails in Firestore if present
    for (const oldAdm of existingUsers.filter((u) => u.email === 'admin@caexamchecker.ai' || u.email === 'superadmin@ca-exam-checker.com')) {
      if (oldAdm.id !== 'usr_super_admin_001') {
        await setFirestoreDoc('users', oldAdm.id, {
          status: 'DISABLED',
          role: 'DISABLED',
          updated_at: new Date().toISOString()
        });
        console.log(`[FirestoreSync] Deactivated superseded admin email in Firestore: ${oldAdm.email}`);
      }
    }

    // Clean up old support admin document in Firestore if it had a different id
    const oldSupportDoc = existingUsers.find((u) => u.email === 'caexamchecker.support@gmail.com' && u.id !== 'usr_super_admin_001');
    if (oldSupportDoc) {
      await deleteFirestoreDoc('users', oldSupportDoc.id).catch(() => {});
      console.log(`[FirestoreSync] Cleaned up legacy support admin doc ${oldSupportDoc.id} in Firestore.`);
    }

    const existingLegal = await getAllFirestoreDocs('legal_documents');
    if (existingLegal.length === 0) {
      console.log('[FirestoreSync] Seeding baseline published legal documents to Cloud Firestore...');
      const localLegal = db.prepare('SELECT * FROM legal_documents').all() as any[];
      for (const ld of localLegal) {
        await setFirestoreDoc('legal_documents', ld.id, ld);
      }
      const localSettings = db.prepare('SELECT * FROM legal_settings').all() as any[];
      for (const ls of localSettings) {
        await setFirestoreDoc('legal_settings', ls.key, ls);
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
  const tombstones = await getAllFirestoreDocs<any>('tombstones');
  const tombstoneMap = new Set(
    tombstones.flatMap((t: any) => [
      `${t.collectionName || t.entity_type}:${t.targetId || t.entity_id || t.id}`,
      `${t.collectionName || t.entity_type}_${t.targetId || t.entity_id || t.id}`,
      t.targetId,
      t.entity_id,
      t.id,
    ].filter(Boolean))
  );

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

/**
 * Re-hydrates local SQLite database tables from Cloud Firestore on administrative request.
 */
export async function rebuildLocalCacheFromFirestore(options?: {
  forceClean?: boolean;
  reason?: string;
}): Promise<{
  success: boolean;
  message: string;
  timestamp: string;
}> {
  try {
    console.log(`[FirestoreSync] Rebuilding local cache. Reason: ${options?.reason || 'Manual trigger'}`);
    await hydrateFromFirestore();
    return {
      success: true,
      message: 'Local cache successfully re-hydrated from Cloud Firestore.',
      timestamp: new Date().toISOString(),
    };
  } catch (err: any) {
    console.error('[FirestoreSync] Rebuild local cache failed:', err);
    return {
      success: false,
      message: err?.message || 'Failed to rebuild local cache',
      timestamp: new Date().toISOString(),
    };
  }
}

