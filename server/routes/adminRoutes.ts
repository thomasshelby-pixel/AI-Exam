import { Router, Response } from 'express';
import crypto from 'node:crypto';
import { db } from '../db.js';
import { authenticateToken, requireRole, AuthRequest } from '../auth.js';
import { extractMaterialFromPDF } from '../gemini.js';
import { recordCreditPurchase, getValidStudentCreditBalance } from '../services/studentCreditService.js';
import { getAllMcqRules, resetDefaultMcqRules, getCanonicalPaperName } from '../mcqRules.js';
import { deleteStudentAccount, updateStudentClassification } from '../services/studentDeleteService.js';
import { deleteInstituteAccount, updateInstituteClassification } from '../services/instituteDeleteService.js';
import {
  getTestCleanupPreview,
  deleteSingleTestRecord,
  bulkDeleteTestCategory,
  bulkDeleteAllTestData,
} from '../services/testDataCleanupService.js';
import {
  getPaymentOrderDetails,
  deletePaymentOrder,
  bulkDeletePaymentOrders,
  deletePaymentTransaction,
} from '../services/paymentDeleteService.js';
import {
  getEvaluationDetails,
  deleteEvaluation,
  bulkDeleteEvaluations,
} from '../services/evaluationDeleteService.js';
import { permanentlyDeleteFromFirestore } from '../services/firestoreSyncService.js';
import { deleteMaterialCloudFiles } from '../services/persistentStorageService.js';

const router = Router();

// Strict Super Admin Access ONLY
router.use(authenticateToken);
router.use(requireRole('SUPER_ADMIN'));

// 1. Admin Dashboard Overview
router.get('/dashboard', (req: AuthRequest, res: Response) => {
  try {
    const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
    const totalStudents = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'STUDENT'").get() as { count: number };
    const totalInstitutes = db.prepare('SELECT COUNT(*) as count FROM institutes').get() as { count: number };
    const totalEvaluations = db.prepare("SELECT COUNT(*) as count FROM evaluations WHERE status = 'COMPLETED'").get() as { count: number };
    const totalRevenuePaise = db.prepare("SELECT SUM(amount_paise) as sum FROM payment_transactions WHERE status = 'SUCCESS'").get() as { sum: number | null };
    const permanentFreeCount = db.prepare('SELECT COUNT(*) as count FROM permanent_free_entitlements WHERE is_active = 1').get() as { count: number };

    // Recent system activity
    const recentLogs = db.prepare(`
      SELECT l.*, u.email as user_email
      FROM audit_logs l
      LEFT JOIN users u ON u.id = l.user_id
      ORDER BY l.created_at DESC
      LIMIT 10
    `).all();

    // Recent evaluations
    const recentEvaluations = db.prepare(`
      SELECT e.id, e.subject_name, e.level, e.total_marks, e.maximum_marks, e.percentage,
             e.status, e.created_at, u.full_name as student_name, u.email as student_email
      FROM evaluations e
      JOIN users u ON u.id = e.student_id
      ORDER BY e.created_at DESC
      LIMIT 8
    `).all();

    return res.json({
      metrics: {
        totalUsers: totalUsers.count,
        totalStudents: totalStudents.count,
        totalInstitutes: totalInstitutes.count,
        totalEvaluations: totalEvaluations.count,
        totalRevenueINR: Math.round((totalRevenuePaise.sum || 0) / 100),
        permanentFreeAccounts: permanentFreeCount.count,
      },
      recentLogs,
      recentEvaluations,
    });
  } catch (error: unknown) {
    console.error('Admin dashboard overview error:', error);
    return res.status(500).json({ error: 'Failed to load admin overview' });
  }
});

// 2. Users Management
router.get('/users', (req: AuthRequest, res: Response) => {
  try {
    const { role, status, search } = req.query;
    let query = `
      SELECT u.id, u.email, u.full_name, u.phone, u.role, u.status, u.created_at,
             p.icai_registration_number, p.ca_level, p.free_evaluations_used, p.purchased_credits,
             pfe.is_active as permanent_free_active
      FROM users u
      LEFT JOIN student_profiles p ON p.user_id = u.id
      LEFT JOIN permanent_free_entitlements pfe ON lower(pfe.email) = lower(u.email) AND pfe.is_active = 1
      WHERE 1=1
    `;
    const params: any[] = [];

    if (role) {
      query += ' AND u.role = ?';
      params.push(role);
    }
    if (status) {
      query += ' AND u.status = ?';
      params.push(status);
    }
    if (search) {
      query += ' AND (u.email LIKE ? OR u.full_name LIKE ? OR p.icai_registration_number LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY u.created_at DESC LIMIT 200';
    const users = db.prepare(query).all(...params);
    return res.json({ users });
  } catch (error: unknown) {
    console.error('Admin list users error:', error);
    return res.status(500).json({ error: 'Failed to retrieve users' });
  }
});

router.put('/users/:id/status', (req: AuthRequest, res: Response) => {
  try {
    const userId = req.params.id;
    const { status, reason, internalNote } = req.body;

    if (!['ACTIVE', 'SUSPENDED', 'BLOCKED'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, userId);

    if (status === 'SUSPENDED') {
      // Invalidate all active sessions immediately server-side
      db.prepare("UPDATE user_sessions SET status = 'REVOKED', revoked_at = CURRENT_TIMESTAMP WHERE user_id = ? AND status = 'ACTIVE'").run(userId);

      const suspensionId = `susp_${crypto.randomBytes(8).toString('hex')}`;
      const suspReason = reason?.trim() || 'Account suspended by administrator for policy violation.';
      const suspNote = internalNote?.trim() || '';

      db.prepare(`
        INSERT INTO account_suspensions (id, user_id, reason, internal_note, suspended_by, status)
        VALUES (?, ?, ?, ?, ?, 'SUSPENDED')
      `).run(suspensionId, userId, suspReason, suspNote, req.user!.id);

      db.prepare(`
        INSERT INTO notifications (id, user_id, title, message, type)
        VALUES (?, ?, 'Account Suspended', ?, 'WARNING')
      `).run(`notif_${crypto.randomBytes(8).toString('hex')}`, userId, `Your account has been suspended: ${suspReason}. You may submit a formal appeal.`);
    } else if (status === 'ACTIVE') {
      db.prepare(`
        UPDATE account_suspensions
        SET status = 'REINSTATED', updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND status = 'SUSPENDED'
      `).run(userId);

      db.prepare(`
        INSERT INTO notifications (id, user_id, title, message, type)
        VALUES (?, ?, 'Account Reinstated', 'Your account has been reinstated to active status by the administrator.', 'SYSTEM')
      `).run(`notif_${crypto.randomBytes(8).toString('hex')}`, userId);
    }

    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details)
      VALUES (?, ?, 'USER_STATUS_CHANGE', 'USER', ?, ?)
    `).run(
      `log_${crypto.randomBytes(8).toString('hex')}`,
      req.user!.id,
      userId,
      `Changed status to ${status}. Reason: ${reason || 'N/A'}`
    );

    return res.json({ success: true, message: `User status set to ${status}` });
  } catch (error: unknown) {
    console.error('Update user status error:', error);
    return res.status(500).json({ error: 'Failed to update user status' });
  }
});

// Revocation Requests Listing (Admin Portal)
router.get('/revocation-requests', (req: AuthRequest, res: Response) => {
  try {
    const { status } = req.query;
    let query = `
      SELECT r.*,
             u.email as user_email, u.full_name as user_name, u.role as user_role, u.status as user_status,
             s.reason as suspension_reason, s.internal_note as suspension_note, s.created_at as suspended_at,
             reviewer.full_name as reviewer_name
      FROM revocation_requests r
      JOIN users u ON u.id = r.user_id
      LEFT JOIN account_suspensions s ON s.id = r.suspension_id
      LEFT JOIN users reviewer ON reviewer.id = r.reviewed_by
      WHERE 1=1
    `;
    const params: any[] = [];

    if (status) {
      query += ' AND r.status = ?';
      params.push(status);
    }

    query += ' ORDER BY r.created_at DESC';

    const requests = db.prepare(query).all(...params);
    return res.json({ requests });
  } catch (error: unknown) {
    console.error('Get revocation requests error:', error);
    return res.status(500).json({ error: 'Failed to retrieve revocation requests' });
  }
});

// Revocation Request Review (Approve or Reject)
router.post('/revocation-requests/:id/review', (req: AuthRequest, res: Response) => {
  try {
    const requestId = req.params.id;
    const { decision, adminReply } = req.body;

    if (!decision || !['APPROVED', 'REJECTED'].includes(decision)) {
      return res.status(400).json({ error: 'Decision must be either APPROVED or REJECTED' });
    }

    const request = db.prepare('SELECT * FROM revocation_requests WHERE id = ?').get(requestId) as any;
    if (!request) {
      return res.status(404).json({ error: 'Revocation request not found' });
    }

    const reply = adminReply?.trim() || (decision === 'APPROVED' ? 'Your appeal has been reviewed and accepted. Account access is reinstated.' : 'Your appeal has been reviewed and denied.');

    // Update request
    db.prepare(`
      UPDATE revocation_requests
      SET status = ?,
          admin_reply = ?,
          reviewed_by = ?,
          reviewed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(decision, reply, req.user!.id, requestId);

    if (decision === 'APPROVED') {
      // Reinstate user
      db.prepare("UPDATE users SET status = 'ACTIVE' WHERE id = ?").run(request.user_id);

      // Mark suspension as reinstated
      if (request.suspension_id) {
        db.prepare("UPDATE account_suspensions SET status = 'REINSTATED', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(request.suspension_id);
      } else {
        db.prepare("UPDATE account_suspensions SET status = 'REINSTATED', updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND status = 'SUSPENDED'").run(request.user_id);
      }

      // Notify user
      db.prepare(`
        INSERT INTO notifications (id, user_id, title, message, type)
        VALUES (?, ?, 'Account Appeal Approved', ?, 'SYSTEM')
      `).run(`notif_${crypto.randomBytes(8).toString('hex')}`, request.user_id, `Your suspension appeal was approved. Message: ${reply}`);
    } else {
      // Notify user of rejection
      db.prepare(`
        INSERT INTO notifications (id, user_id, title, message, type)
        VALUES (?, ?, 'Account Appeal Rejected', ?, 'WARNING')
      `).run(`notif_${crypto.randomBytes(8).toString('hex')}`, request.user_id, `Your suspension appeal was reviewed and rejected. Reason: ${reply}`);
    }

    // Audit log
    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details)
      VALUES (?, ?, 'REVOCATION_REVIEW', 'USER', ?, ?)
    `).run(
      `log_${crypto.randomBytes(8).toString('hex')}`,
      req.user!.id,
      request.user_id,
      `Reviewed revocation request ${requestId}: Decision ${decision}. Reply: ${reply}`
    );

    return res.json({
      success: true,
      message: `Revocation appeal has been ${decision.toLowerCase()}.`,
      decision,
    });
  } catch (error: unknown) {
    console.error('Review revocation request error:', error);
    return res.status(500).json({ error: 'Failed to process revocation review' });
  }
});

// Adjust student credits manually
router.post('/students/:id/adjust-credits', (req: AuthRequest, res: Response) => {
  try {
    const studentId = req.params.id;
    const { creditsDelta, reason } = req.body;

    const delta = Number(creditsDelta);
    if (isNaN(delta) || delta === 0) {
      return res.status(400).json({ error: 'Invalid credits delta' });
    }

    const profile = db.prepare('SELECT purchased_credits FROM student_profiles WHERE user_id = ?').get(studentId) as {
      purchased_credits: number;
    } | undefined;

    if (!profile) {
      return res.status(404).json({ error: 'Student profile not found' });
    }

    let newBalance = 0;
    if (delta > 0) {
      const lotRes = recordCreditPurchase({
        userId: studentId,
        creditsPurchased: delta,
        purchaseDate: new Date(),
      });
      newBalance = lotRes.totalValidCredits;
    } else {
      newBalance = Math.max(0, getValidStudentCreditBalance(studentId) + delta);
      db.prepare('UPDATE student_profiles SET purchased_credits = ? WHERE user_id = ?').run(newBalance, studentId);
    }

    // Ledger record
    db.prepare(`
      INSERT INTO credit_ledger (id, student_id, amount, source, balance_after, note)
      VALUES (?, ?, ?, 'PURCHASED', ?, ?)
    `).run(
      `cld_${crypto.randomBytes(8).toString('hex')}`,
      studentId,
      delta,
      newBalance,
      `Admin adjustment: ${reason || 'Manual override by Super Admin'}`
    );

    // Audit log
    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details)
      VALUES (?, ?, 'ADMIN_CREDIT_ADJUSTMENT', 'STUDENT', ?, ?)
    `).run(
      `log_${crypto.randomBytes(8).toString('hex')}`,
      req.user!.id,
      studentId,
      `Adjusted credits by ${delta} (New Balance: ${newBalance}). Reason: ${reason}`
    );

    return res.json({ success: true, newBalance });
  } catch (error: unknown) {
    console.error('Adjust credits error:', error);
    return res.status(500).json({ error: 'Failed to adjust credits' });
  }
});

// 3. Permanent Free Entitlements Management
router.get('/free-access', (req: AuthRequest, res: Response) => {
  try {
    const entitlements = db.prepare(`
      SELECT * FROM permanent_free_entitlements ORDER BY created_at DESC
    `).all();
    return res.json({ entitlements });
  } catch (error: unknown) {
    console.error('Get free access error:', error);
    return res.status(500).json({ error: 'Failed to load permanent free list' });
  }
});

router.post('/free-access', (req: AuthRequest, res: Response) => {
  try {
    const { email, reason } = req.body;
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'A valid email address is required.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const id = `pfe_${Buffer.from(normalizedEmail).toString('hex').slice(0, 12)}`;

    db.prepare(`
      INSERT INTO permanent_free_entitlements (id, email, reason, granted_by, is_active)
      VALUES (?, ?, ?, ?, 1)
      ON CONFLICT(email) DO UPDATE SET is_active = 1, reason = excluded.reason
    `).run(id, normalizedEmail, reason?.trim() || 'Granted by Super Admin', req.user!.email);

    // Audit log
    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details)
      VALUES (?, ?, 'GRANT_PERMANENT_FREE', 'ENTITLEMENT', ?, ?)
    `).run(
      `log_${crypto.randomBytes(8).toString('hex')}`,
      req.user!.id,
      id,
      `Granted permanent free access to ${normalizedEmail}`
    );

    return res.status(201).json({ success: true, message: `Permanent free access granted to ${normalizedEmail}` });
  } catch (error: unknown) {
    console.error('Grant free access error:', error);
    return res.status(500).json({ error: 'Failed to grant free access' });
  }
});

router.delete('/free-access/:id', (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id;
    const entitlement = db.prepare('SELECT email FROM permanent_free_entitlements WHERE id = ?').get(id) as { email: string } | undefined;

    if (!entitlement) {
      return res.status(404).json({ error: 'Entitlement record not found' });
    }

    db.prepare('UPDATE permanent_free_entitlements SET is_active = 0 WHERE id = ?').run(id);

    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details)
      VALUES (?, ?, 'REVOKE_PERMANENT_FREE', 'ENTITLEMENT', ?, ?)
    `).run(
      `log_${crypto.randomBytes(8).toString('hex')}`,
      req.user!.id,
      id,
      `Revoked permanent free access from ${entitlement.email}`
    );

    return res.json({ success: true, message: `Permanent free access revoked for ${entitlement.email}` });
  } catch (error: unknown) {
    console.error('Revoke free access error:', error);
    return res.status(500).json({ error: 'Failed to revoke free access' });
  }
});

// 4. Reference Evaluation Materials Management
router.get('/materials', (req: AuthRequest, res: Response) => {
  try {
    const { level, materialType, subjectKey, status, search } = req.query;
    let query = `
      SELECT id, level, material_type, model_group, subject_key, subject_name,
             paper, attempt, syllabus_version, chapter_topic,
             question_paper_title, effective_date, version, status,
             uploaded_by, created_at, updated_at,
             LENGTH(COALESCE(question_paper_text, '')) as qp_chars,
             LENGTH(COALESCE(suggested_answers_text, '')) as sa_chars,
             LENGTH(COALESCE(marking_scheme_text, '')) as ms_chars,
             LENGTH(COALESCE(reference_guidance_text, '')) as rg_chars,
             LENGTH(COALESCE(amendments_provisions_text, '')) as ap_chars
      FROM evaluation_materials
      WHERE 1=1
    `;
    const params: any[] = [];

    if (level && level !== 'ALL') {
      query += ' AND level = ?';
      params.push(level);
    }
    if (materialType && materialType !== 'ALL') {
      query += ' AND material_type = ?';
      params.push(materialType);
    }
    if (subjectKey && subjectKey !== 'ALL') {
      query += ' AND subject_key = ?';
      params.push(subjectKey);
    }
    if (status && status !== 'ALL') {
      query += ' AND status = ?';
      params.push(status);
    }
    if (search) {
      query += ' AND (question_paper_title LIKE ? OR subject_name LIKE ? OR attempt LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY created_at DESC';
    const materials = db.prepare(query).all(...params);
    return res.json({ materials });
  } catch (error: unknown) {
    console.error('Get materials error:', error);
    return res.status(500).json({ error: 'Failed to load reference materials' });
  }
});

router.post('/materials/extract-pdf', async (req: AuthRequest, res: Response) => {
  try {
    const { fileBase64, mimeType, documentRole } = req.body;
    if (!fileBase64) {
      return res.status(400).json({ error: 'Please provide base64 document data' });
    }

    const cleanBase64 = fileBase64.includes(',') ? fileBase64.split(',')[1] : fileBase64;
    const extracted = await extractMaterialFromPDF(
      cleanBase64,
      mimeType || 'application/pdf',
      documentRole || 'COMPLETE_SUITE'
    );

    return res.json({ success: true, extracted });
  } catch (error: unknown) {
    console.error('PDF extraction error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to extract text from document';
    return res.status(500).json({ error: msg });
  }
});

router.get('/materials/:id', (req: AuthRequest, res: Response) => {
  try {
    const material = db.prepare(`
      SELECT * FROM evaluation_materials WHERE id = ?
    `).get(req.params.id);

    if (!material) {
      return res.status(404).json({ error: 'Evaluation material not found' });
    }

    return res.json({ material });
  } catch (error: unknown) {
    console.error('Get single material error:', error);
    return res.status(500).json({ error: 'Failed to load material details' });
  }
});

router.post('/materials', (req: AuthRequest, res: Response) => {
  try {
    const {
      level,
      materialType,
      modelGroup,
      subjectKey,
      subjectName,
      paper,
      attempt,
      syllabusVersion,
      chapterTopic,
      questionPaperTitle,
      questionPaperText,
      suggestedAnswersText,
      markingSchemeText,
      referenceGuidanceText,
      amendmentsProvisionsText,
      effectiveDate,
      version,
      status,
    } = req.body;

    if (!level || !materialType || !subjectKey || !subjectName || !questionPaperTitle || !questionPaperText || !suggestedAnswersText) {
      return res.status(400).json({ error: 'Please provide required fields: level, materialType, subjectKey, subjectName, title, question paper text, and suggested answers text.' });
    }

    const materialId = `mat_${crypto.randomBytes(8).toString('hex')}`;
    db.prepare(`
      INSERT INTO evaluation_materials (
        id, level, material_type, model_group, subject_key, subject_name,
        paper, attempt, syllabus_version, chapter_topic,
        question_paper_title, question_paper_text, suggested_answers_text,
        marking_scheme_text, reference_guidance_text, amendments_provisions_text,
        effective_date, version, status, uploaded_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      materialId,
      level,
      materialType,
      modelGroup || null,
      subjectKey,
      subjectName,
      paper || 'Paper 1',
      attempt || 'Current',
      syllabusVersion || 'New Scheme 2024',
      chapterTopic || null,
      questionPaperTitle.trim(),
      questionPaperText.trim(),
      suggestedAnswersText.trim(),
      markingSchemeText?.trim() || '',
      referenceGuidanceText?.trim() || '',
      amendmentsProvisionsText?.trim() || '',
      effectiveDate || new Date().toISOString().split('T')[0],
      version || '1.0',
      status || 'ACTIVE',
      req.user!.email
    );

    // Audit log
    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details)
      VALUES (?, ?, 'UPLOAD_MATERIAL', 'MATERIAL', ?, ?)
    `).run(
      `log_${crypto.randomBytes(8).toString('hex')}`,
      req.user!.id,
      materialId,
      `Uploaded ${materialType} for ${subjectName} (${attempt || 'Current'}) v${version || '1.0'}`
    );

    return res.status(201).json({ success: true, materialId, message: 'Evaluation material uploaded successfully.' });
  } catch (error: unknown) {
    console.error('Upload material error:', error);
    return res.status(500).json({ error: 'Failed to save evaluation material' });
  }
});

router.put('/materials/:id', (req: AuthRequest, res: Response) => {
  try {
    const existing = db.prepare('SELECT id, question_paper_title FROM evaluation_materials WHERE id = ?').get(req.params.id) as { id: string; question_paper_title: string } | undefined;
    if (!existing) {
      return res.status(404).json({ error: 'Material not found' });
    }

    const {
      level,
      materialType,
      modelGroup,
      subjectKey,
      subjectName,
      paper,
      attempt,
      syllabusVersion,
      chapterTopic,
      questionPaperTitle,
      questionPaperText,
      suggestedAnswersText,
      markingSchemeText,
      referenceGuidanceText,
      amendmentsProvisionsText,
      effectiveDate,
      version,
      status,
    } = req.body;

    db.prepare(`
      UPDATE evaluation_materials
      SET level = COALESCE(?, level),
          material_type = COALESCE(?, material_type),
          model_group = COALESCE(?, model_group),
          subject_key = COALESCE(?, subject_key),
          subject_name = COALESCE(?, subject_name),
          paper = COALESCE(?, paper),
          attempt = COALESCE(?, attempt),
          syllabus_version = COALESCE(?, syllabus_version),
          chapter_topic = COALESCE(?, chapter_topic),
          question_paper_title = COALESCE(?, question_paper_title),
          question_paper_text = COALESCE(?, question_paper_text),
          suggested_answers_text = COALESCE(?, suggested_answers_text),
          marking_scheme_text = COALESCE(?, marking_scheme_text),
          reference_guidance_text = COALESCE(?, reference_guidance_text),
          amendments_provisions_text = COALESCE(?, amendments_provisions_text),
          effective_date = COALESCE(?, effective_date),
          version = COALESCE(?, version),
          status = COALESCE(?, status),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      level || null,
      materialType || null,
      modelGroup || null,
      subjectKey || null,
      subjectName || null,
      paper || null,
      attempt || null,
      syllabusVersion || null,
      chapterTopic || null,
      questionPaperTitle || null,
      questionPaperText || null,
      suggestedAnswersText || null,
      markingSchemeText || null,
      referenceGuidanceText || null,
      amendmentsProvisionsText || null,
      effectiveDate || null,
      version || null,
      status || null,
      req.params.id
    );

    // Audit log
    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details)
      VALUES (?, ?, 'UPDATE_MATERIAL', 'MATERIAL', ?, ?)
    `).run(
      `log_${crypto.randomBytes(8).toString('hex')}`,
      req.user!.id,
      req.params.id,
      `Updated material ${existing.question_paper_title} (v${version || 'updated'})`
    );

    return res.json({ success: true, message: 'Evaluation material updated successfully' });
  } catch (error: unknown) {
    console.error('Update material error:', error);
    return res.status(500).json({ error: 'Failed to update evaluation material' });
  }
});

router.put('/materials/:id/status', (req: AuthRequest, res: Response) => {
  try {
    const { status } = req.body;
    if (!status || !['ACTIVE', 'INACTIVE'].includes(status)) {
      return res.status(400).json({ error: 'Status must be ACTIVE or INACTIVE' });
    }

    const material = db.prepare('SELECT id, question_paper_title FROM evaluation_materials WHERE id = ?').get(req.params.id) as { id: string; question_paper_title: string } | undefined;
    if (!material) {
      return res.status(404).json({ error: 'Material not found' });
    }

    db.prepare('UPDATE evaluation_materials SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, req.params.id);

    // Audit log
    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details)
      VALUES (?, ?, 'CHANGE_MATERIAL_STATUS', 'MATERIAL', ?, ?)
    `).run(
      `log_${crypto.randomBytes(8).toString('hex')}`,
      req.user!.id,
      req.params.id,
      `Set status of material ${material.question_paper_title} to ${status}`
    );

    return res.json({ success: true, message: `Material status changed to ${status}` });
  } catch (error: unknown) {
    console.error('Toggle material status error:', error);
    return res.status(500).json({ error: 'Failed to update material status' });
  }
});

router.delete('/materials/:id', (req: AuthRequest, res: Response) => {
  try {
    const material = db.prepare('SELECT id, question_paper_title FROM evaluation_materials WHERE id = ?').get(req.params.id) as { id: string; question_paper_title: string } | undefined;
    if (!material) {
      return res.status(404).json({ error: 'Material not found' });
    }

    db.prepare('DELETE FROM evaluation_materials WHERE id = ?').run(req.params.id);

    // Delete associated files from Firebase Cloud Storage and permanently tombstone from Firestore
    try {
      permanentlyDeleteFromFirestore('evaluation_materials', req.params.id, 'Administrative material deletion');
      deleteMaterialCloudFiles(req.params.id).catch((e) => {
        console.warn('[AdminRoutes] Warning deleting Cloud Storage files for material:', e);
      });
    } catch (fsErr) {
      console.warn('[AdminRoutes] Warning during material cloud storage deletion:', fsErr);
    }

    // Audit log
    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details)
      VALUES (?, ?, 'DELETE_MATERIAL', 'MATERIAL', ?, ?)
    `).run(
      `log_${crypto.randomBytes(8).toString('hex')}`,
      req.user!.id,
      req.params.id,
      `Deleted material: ${material.question_paper_title}`
    );

    return res.json({ success: true, message: 'Material deleted successfully' });
  } catch (error: unknown) {
    console.error('Delete material error:', error);
    return res.status(500).json({ error: 'Failed to delete material' });
  }
});

// 4B. Evaluation Controls & Rules Configuration (Section 18)
router.get('/evaluation-controls', (req: AuthRequest, res: Response) => {
  try {
    const keys = [
      'EVAL_CHECKING_MODE',
      'EVAL_MODEL_PROVIDER',
      'EVAL_CONFIDENCE_THRESHOLD',
      'EVAL_STEP_MARKING_ENABLED',
      'EVAL_CONSEQUENTIAL_ERROR_ENABLED',
      'EVAL_MCQ_NEGATIVE_MARKING',
      'EVAL_EQUIVALENT_ANSWER_DETECTION',
      'EVAL_MATERIAL_PRIORITY',
    ];

    const placeholders = keys.map(() => '?').join(',');
    const rows = db.prepare(`SELECT key, value, description FROM pricing_settings WHERE key IN (${placeholders})`).all(...keys) as Array<{ key: string; value: string; description: string }>;

    const settingsMap: Record<string, string> = {};
    for (const r of rows) {
      settingsMap[r.key] = r.value;
    }

    return res.json({
      settings: settingsMap,
      definitions: rows,
    });
  } catch (error: unknown) {
    console.error('Get evaluation controls error:', error);
    return res.status(500).json({ error: 'Failed to load evaluation controls' });
  }
});

router.put('/evaluation-controls', (req: AuthRequest, res: Response) => {
  try {
    const settings = req.body;
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ error: 'Invalid settings object' });
    }

    const updateStmt = db.prepare(`
      INSERT INTO pricing_settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `);

    for (const [key, value] of Object.entries(settings)) {
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        updateStmt.run(key, String(value));
      }
    }

    // Audit log
    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, details)
      VALUES (?, ?, 'UPDATE_EVALUATION_CONTROLS', 'SYSTEM', ?)
    `).run(
      `log_${crypto.randomBytes(8).toString('hex')}`,
      req.user!.id,
      `Admin updated evaluation rules: ${Object.keys(settings).join(', ')}`
    );

    return res.json({ success: true, message: 'Evaluation controls updated successfully' });
  } catch (error: unknown) {
    console.error('Update evaluation controls error:', error);
    return res.status(500).json({ error: 'Failed to update evaluation controls' });
  }
});

// 5. Institutes Management
router.get('/institutes', (req: AuthRequest, res: Response) => {
  try {
    const institutes = db.prepare(`
      SELECT i.*, 
             COUNT(m.id) as student_count,
             SUM(CASE WHEN m.status = 'ACTIVE' THEN 1 ELSE 0 END) as active_count
      FROM institutes i
      LEFT JOIN institute_memberships m ON m.institute_id = i.id
      GROUP BY i.id
      ORDER BY i.created_at DESC
    `).all();
    return res.json({ institutes });
  } catch (error: unknown) {
    console.error('Get institutes error:', error);
    return res.status(500).json({ error: 'Failed to load institutes' });
  }
});

router.put('/institutes/:id/status', (req: AuthRequest, res: Response) => {
  try {
    const { status, subscriptionExpiresAt, maxStudents } = req.body;
    db.prepare(`
      UPDATE institutes
      SET status = COALESCE(?, status),
          subscription_expires_at = COALESCE(?, subscription_expires_at),
          max_students = COALESCE(?, max_students)
      WHERE id = ?
    `).run(status || null, subscriptionExpiresAt || null, maxStudents || null, req.params.id);

    return res.json({ success: true, message: 'Institute updated successfully' });
  } catch (error: unknown) {
    console.error('Update institute error:', error);
    return res.status(500).json({ error: 'Failed to update institute' });
  }
});

// Update Institute Account Classification (NORMAL vs TEST)
router.put('/institutes/:id/classification', (req: AuthRequest, res: Response) => {
  try {
    const { classification } = req.body;
    const result = updateInstituteClassification(req.params.id, classification, req.user!);
    return res.json(result);
  } catch (error: any) {
    console.error('Update institute classification error:', error);
    return res.status(error.statusCode || 500).json({ error: error.message || 'Failed to update institute classification' });
  }
});

// Delete Institute Account (SUPER ADMIN ONLY)
router.delete('/institutes/:id', (req: AuthRequest, res: Response) => {
  try {
    const ipAddress = req.ip || (req.headers['x-forwarded-for'] as string) || null;
    const userAgent = req.headers['user-agent'] || null;

    const result = deleteInstituteAccount(req.params.id, req.user!, ipAddress, userAgent);
    return res.json(result);
  } catch (error: any) {
    console.error('Delete institute error:', error);
    return res.status(error.statusCode || 500).json({ error: error.message || 'Failed to delete institute' });
  }
});

// 6. Payments & Transactions
router.get('/payments', (req: AuthRequest, res: Response) => {
  try {
    const orders = db.prepare(`
      SELECT o.*, 
             COALESCE(o.account_classification, 'NORMAL') as account_classification,
             u.full_name as student_name, u.email as student_email,
             t.id as transaction_id, t.razorpay_payment_id, t.created_at as paid_at,
             t.status as transaction_status
      FROM payment_orders o
      JOIN users u ON u.id = o.student_id
      LEFT JOIN payment_transactions t ON t.order_id = o.id
      ORDER BY o.created_at DESC
      LIMIT 100
    `).all();
    return res.json({ orders });
  } catch (error: unknown) {
    console.error('Get payments error:', error);
    return res.status(500).json({ error: 'Failed to load payments' });
  }
});

// View Single Payment Order Details
router.get('/payments/orders/:id', (req: AuthRequest, res: Response) => {
  try {
    const details = getPaymentOrderDetails(req.params.id, req.user!);
    return res.json(details);
  } catch (error: any) {
    console.error('Get payment order details error:', error);
    return res.status(error.statusCode || 500).json({ error: error.message || 'Failed to load payment order details' });
  }
});

// Delete Payment Order (Super Admin can delete ANY payment order)
router.delete('/payments/orders/:id', (req: AuthRequest, res: Response) => {
  try {
    const ipAddress = req.ip || (req.headers['x-forwarded-for'] as string) || null;
    const userAgent = (req.headers['user-agent'] as string) || null;
    const reason = (req.body?.reason || req.query?.reason || 'Testing') as string;
    const notes = (req.body?.notes || req.query?.notes || '') as string;

    const result = deletePaymentOrder(
      req.params.id,
      req.user!,
      { reason, notes },
      ipAddress,
      userAgent
    );
    return res.json(result);
  } catch (error: any) {
    console.error('Delete payment order error:', error);
    return res.status(error.statusCode || 500).json({ error: error.message || 'Failed to delete payment order' });
  }
});

// Bulk Delete Payment Orders (Super Admin)
router.post('/payments/orders/bulk-delete', (req: AuthRequest, res: Response) => {
  try {
    const ipAddress = req.ip || (req.headers['x-forwarded-for'] as string) || null;
    const userAgent = (req.headers['user-agent'] as string) || null;
    const { orderIds, reason, notes } = req.body || {};

    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({ error: 'Please provide an array of orderIds to delete.' });
    }

    const result = bulkDeletePaymentOrders(
      orderIds,
      req.user!,
      { reason: reason || 'Testing', notes: notes || '' },
      ipAddress,
      userAgent
    );
    return res.json(result);
  } catch (error: any) {
    console.error('Bulk delete payment orders error:', error);
    return res.status(error.statusCode || 500).json({ error: error.message || 'Failed to bulk delete payment orders' });
  }
});

// Delete Payment Transaction
router.delete('/payments/transactions/:id', (req: AuthRequest, res: Response) => {
  try {
    const ipAddress = req.ip || (req.headers['x-forwarded-for'] as string) || null;
    const userAgent = (req.headers['user-agent'] as string) || null;
    const reason = (req.body?.reason || req.query?.reason || 'Testing') as string;
    const notes = (req.body?.notes || req.query?.notes || '') as string;

    const result = deletePaymentTransaction(
      req.params.id,
      req.user!,
      { reason, notes },
      ipAddress,
      userAgent
    );
    return res.json(result);
  } catch (error: any) {
    console.error('Delete payment transaction error:', error);
    return res.status(error.statusCode || 500).json({ error: error.message || 'Failed to delete payment transaction' });
  }
});

// 6B. Test Data Cleanup Endpoints
router.get('/test-cleanup/preview', (req: AuthRequest, res: Response) => {
  try {
    const preview = getTestCleanupPreview();
    return res.json(preview);
  } catch (error: any) {
    console.error('Test cleanup preview error:', error);
    return res.status(500).json({ error: error.message || 'Failed to generate test cleanup preview' });
  }
});

router.post('/test-cleanup/delete-record', (req: AuthRequest, res: Response) => {
  try {
    const { category, id } = req.body;
    if (!category || !id) {
      return res.status(400).json({ error: 'Category and ID are required' });
    }
    const ipAddress = req.ip || (req.headers['x-forwarded-for'] as string) || null;
    const userAgent = req.headers['user-agent'] || null;

    const result = deleteSingleTestRecord(category, id, req.user!, ipAddress, userAgent);
    return res.json(result);
  } catch (error: any) {
    console.error('Delete test record error:', error);
    return res.status(error.statusCode || 500).json({ error: error.message || 'Failed to delete test record' });
  }
});

router.post('/test-cleanup/delete-category', (req: AuthRequest, res: Response) => {
  try {
    const { category } = req.body;
    if (!category) {
      return res.status(400).json({ error: 'Category is required' });
    }
    const ipAddress = req.ip || (req.headers['x-forwarded-for'] as string) || null;
    const userAgent = req.headers['user-agent'] || null;

    const result = bulkDeleteTestCategory(category, req.user!, ipAddress, userAgent);
    return res.json(result);
  } catch (error: any) {
    console.error('Delete test category error:', error);
    return res.status(error.statusCode || 500).json({ error: error.message || 'Failed to delete test category' });
  }
});

router.post('/test-cleanup/delete-all', (req: AuthRequest, res: Response) => {
  try {
    const { confirmation } = req.body;
    if (confirmation !== 'DELETE ALL TEST DATA') {
      return res.status(400).json({ error: 'Confirmation mismatch. You must send exact confirmation "DELETE ALL TEST DATA"' });
    }
    const ipAddress = req.ip || (req.headers['x-forwarded-for'] as string) || null;
    const userAgent = req.headers['user-agent'] || null;

    const result = bulkDeleteAllTestData(req.user!, ipAddress, userAgent);
    return res.json(result);
  } catch (error: any) {
    console.error('Delete all test data error:', error);
    return res.status(error.statusCode || 500).json({ error: error.message || 'Failed to delete all test data' });
  }
});

// 7. Audit Logs
router.get('/audit-logs', (req: AuthRequest, res: Response) => {
  try {
    const logs = db.prepare(`
      SELECT l.*, u.email as user_email
      FROM audit_logs l
      LEFT JOIN users u ON u.id = l.user_id
      ORDER BY l.created_at DESC
      LIMIT 150
    `).all();
    return res.json({ logs });
  } catch (error: unknown) {
    console.error('Get audit logs error:', error);
    return res.status(500).json({ error: 'Failed to load audit logs' });
  }
});

// 8. Support Tickets
router.get('/support', (req: AuthRequest, res: Response) => {
  try {
    const tickets = db.prepare(`
      SELECT * FROM support_tickets ORDER BY created_at DESC LIMIT 100
    `).all();
    return res.json({ tickets });
  } catch (error: unknown) {
    console.error('Get support tickets error:', error);
    return res.status(500).json({ error: 'Failed to load support tickets' });
  }
});

router.post('/support/:id/reply', (req: AuthRequest, res: Response) => {
  try {
    const { reply, status } = req.body;
    if (!reply) return res.status(400).json({ error: 'Reply text is required' });

    db.prepare(`
      UPDATE support_tickets
      SET admin_reply = ?, status = COALESCE(?, 'RESOLVED'), updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(reply.trim(), status || 'RESOLVED', req.params.id);

    return res.json({ success: true, message: 'Reply submitted successfully' });
  } catch (error: unknown) {
    console.error('Reply ticket error:', error);
    return res.status(500).json({ error: 'Failed to update ticket' });
  }
});

// 9. Students Management
router.get('/students', (req: AuthRequest, res: Response) => {
  try {
    const { search, caLevel, classification } = req.query;
    let query = `
      SELECT u.id, u.email, u.full_name, u.phone, u.status, u.account_classification, u.created_at,
             p.icai_registration_number, p.ca_level, p.free_evaluations_used, p.purchased_credits,
             p.city,
             i.name as institute_name,
             pfe.is_active as permanent_free_active,
             COUNT(e.id) as evaluations_count,
             AVG(e.percentage) as average_percentage
      FROM users u
      LEFT JOIN student_profiles p ON p.user_id = u.id
      LEFT JOIN institutes i ON i.id = p.institute_id
      LEFT JOIN permanent_free_entitlements pfe ON lower(pfe.email) = lower(u.email) AND pfe.is_active = 1
      LEFT JOIN evaluations e ON e.student_id = u.id AND e.status = 'COMPLETED'
      WHERE u.role = 'STUDENT'
    `;
    const params: any[] = [];

    if (search) {
      query += ' AND (u.email LIKE ? OR u.full_name LIKE ? OR p.icai_registration_number LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (caLevel && caLevel !== 'ALL') {
      query += ' AND p.ca_level = ?';
      params.push(caLevel);
    }
    if (classification && classification !== 'ALL') {
      query += ' AND u.account_classification = ?';
      params.push(classification);
    }

    query += ' GROUP BY u.id ORDER BY u.created_at DESC LIMIT 200';
    const students = db.prepare(query).all(...params);
    return res.json({ students });
  } catch (error: unknown) {
    console.error('Get students error:', error);
    return res.status(500).json({ error: 'Failed to retrieve students' });
  }
});

// Get detailed student profile for Super Admin inspection
router.get('/students/:id', (req: AuthRequest, res: Response) => {
  try {
    const studentId = req.params.id;
    const student = db.prepare(`
      SELECT u.id, u.email, u.full_name, u.phone, u.status, u.account_classification, u.created_at, u.updated_at,
             p.icai_registration_number, p.ca_level, p.free_evaluations_used, p.purchased_credits,
             p.city, p.preferred_subjects,
             i.id as institute_id, i.name as institute_name,
             b.id as batch_id, b.name as batch_name,
             pfe.is_active as permanent_free_active,
             COUNT(DISTINCT e.id) as evaluations_count,
             AVG(e.percentage) as average_percentage
      FROM users u
      LEFT JOIN student_profiles p ON p.user_id = u.id
      LEFT JOIN institutes i ON i.id = p.institute_id
      LEFT JOIN batches b ON b.id = p.batch_id
      LEFT JOIN permanent_free_entitlements pfe ON lower(pfe.email) = lower(u.email) AND pfe.is_active = 1
      LEFT JOIN evaluations e ON e.student_id = u.id AND e.status = 'COMPLETED'
      WHERE u.id = ? AND u.role = 'STUDENT'
      GROUP BY u.id
    `).get(studentId);

    if (!student) {
      return res.status(404).json({ error: 'Student not found.' });
    }

    // Recent evaluations
    const recentEvals = db.prepare(`
      SELECT id, subject_name, level, total_marks, maximum_marks, percentage, status, created_at
      FROM evaluations
      WHERE student_id = ?
      ORDER BY created_at DESC
      LIMIT 10
    `).all(studentId);

    // Recent credit ledger
    const creditLedger = db.prepare(`
      SELECT id, amount, source, balance_after, note, created_at
      FROM credit_ledger
      WHERE student_id = ?
      ORDER BY created_at DESC
      LIMIT 10
    `).all(studentId);

    return res.json({
      student,
      recentEvaluations: recentEvals,
      creditLedger,
    });
  } catch (error: unknown) {
    console.error('Get student details error:', error);
    return res.status(500).json({ error: 'Failed to retrieve student details' });
  }
});

// Super Admin Update Student Account Classification (NORMAL vs TEST)
router.patch('/students/:id/classification', (req: AuthRequest, res: Response) => {
  try {
    const { classification } = req.body;
    if (!classification || (classification !== 'NORMAL' && classification !== 'TEST')) {
      return res.status(400).json({ error: "Classification must be 'NORMAL' or 'TEST'." });
    }

    const result = updateStudentClassification(req.params.id, classification, req.user!);
    return res.json(result);
  } catch (error: any) {
    const status = error.statusCode || 500;
    return res.status(status).json({ error: error.message || 'Failed to update student classification' });
  }
});

// Super Admin Permanent Student Account Delete
router.delete('/students/:id', (req: AuthRequest, res: Response) => {
  try {
    const studentId = req.params.id;
    if (!studentId || typeof studentId !== 'string') {
      return res.status(400).json({ error: 'Invalid student identifier provided.' });
    }

    // Explicit check: Only SUPER_ADMIN allowed
    if (req.user?.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Access denied. Only Super Admin can permanently delete student accounts.' });
    }

    const ip = (req.ip || (req.headers['x-forwarded-for'] as string) || '') as string;
    const userAgent = (req.headers['user-agent'] || '') as string;

    const result = deleteStudentAccount(studentId, req.user!, ip, userAgent);
    return res.json(result);
  } catch (error: any) {
    const status = error.statusCode || 500;
    console.error('Delete student account error:', error);
    return res.status(status).json({ error: error.message || 'Failed to delete student account' });
  }
});

// Also support router.delete('/users/:id') with role verification
router.delete('/users/:id', (req: AuthRequest, res: Response) => {
  try {
    const userId = req.params.id;
    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ error: 'Invalid user identifier provided.' });
    }

    if (req.user?.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Access denied. Only Super Admin can delete user accounts.' });
    }

    const target = db.prepare('SELECT id, role, email FROM users WHERE id = ?').get(userId) as any;
    if (!target) {
      return res.status(404).json({ error: 'User not found or already deleted.' });
    }

    if (target.role !== 'STUDENT') {
      return res.status(400).json({
        error: `Deletion via this endpoint is only permitted for STUDENT accounts. User has role ${target.role}.`,
      });
    }

    const ip = (req.ip || (req.headers['x-forwarded-for'] as string) || '') as string;
    const userAgent = (req.headers['user-agent'] || '') as string;

    const result = deleteStudentAccount(userId, req.user!, ip, userAgent);
    return res.json(result);
  } catch (error: any) {
    const status = error.statusCode || 500;
    return res.status(status).json({ error: error.message || 'Failed to delete user' });
  }
});

// Admin Action: Suspend User Account
router.put('/users/:id/suspend', (req: AuthRequest, res: Response) => {
  try {
    const { reason, internalNote } = req.body;
    const targetUserId = req.params.id;

    if (!reason) {
      return res.status(400).json({ error: 'Reason for suspension is required.' });
    }

    const targetUser = db.prepare('SELECT id, email, role, status FROM users WHERE id = ?').get(targetUserId) as {
      id: string;
      email: string;
      role: string;
      status: string;
    } | undefined;

    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (targetUser.role === 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Super Admin accounts cannot be suspended.' });
    }

    const suspensionId = `susp_${crypto.randomBytes(8).toString('hex')}`;

    // Invalidate all active sessions immediately server-side
    db.prepare("UPDATE user_sessions SET status = 'REVOKED', revoked_at = CURRENT_TIMESTAMP WHERE user_id = ? AND status = 'ACTIVE'").run(targetUserId);

    // Mark user as SUSPENDED
    db.prepare("UPDATE users SET status = 'SUSPENDED' WHERE id = ?").run(targetUserId);

    // Record suspension details
    db.prepare(`
      INSERT INTO account_suspensions (id, user_id, reason, internal_note, suspended_by, status)
      VALUES (?, ?, ?, ?, ?, 'SUSPENDED')
    `).run(suspensionId, targetUserId, reason.trim(), internalNote?.trim() || null, req.user!.id);

    // Notification to user
    db.prepare(`
      INSERT INTO notifications (id, user_id, title, message, type)
      VALUES (?, ?, 'Account Suspended', ?, 'ALERT')
    `).run(
      `notif_${crypto.randomBytes(8).toString('hex')}`,
      targetUserId,
      `Your account has been suspended by the administrator. Reason: ${reason}`
    );

    // Audit log
    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details)
      VALUES (?, ?, 'USER_SUSPENDED', 'USER', ?, ?)
    `).run(`log_${crypto.randomBytes(8).toString('hex')}`, req.user!.id, targetUserId, `Suspended user ${targetUser.email}. Reason: ${reason}`);

    return res.json({ success: true, message: `User account suspended successfully: ${targetUser.email}` });
  } catch (error: unknown) {
    console.error('Suspend user error:', error);
    return res.status(500).json({ error: 'Failed to suspend user' });
  }
});

// Admin Action: Reactivate User Account
router.put('/users/:id/reactivate', (req: AuthRequest, res: Response) => {
  try {
    const targetUserId = req.params.id;

    const targetUser = db.prepare('SELECT id, email, role, status FROM users WHERE id = ?').get(targetUserId) as {
      id: string;
      email: string;
      role: string;
      status: string;
    } | undefined;

    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Set user to ACTIVE
    db.prepare("UPDATE users SET status = 'ACTIVE' WHERE id = ?").run(targetUserId);

    // Mark open suspensions as RESOLVED
    db.prepare("UPDATE account_suspensions SET status = 'RESOLVED' WHERE user_id = ? AND status = 'SUSPENDED'").run(targetUserId);

    // Notification to user
    db.prepare(`
      INSERT INTO notifications (id, user_id, title, message, type)
      VALUES (?, ?, 'Account Reactivated', 'Your account has been reactivated. You have full portal access.', 'SYSTEM')
    `).run(`notif_${crypto.randomBytes(8).toString('hex')}`, targetUserId);

    // Audit log
    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details)
      VALUES (?, ?, 'USER_REACTIVATED', 'USER', ?, ?)
    `).run(`log_${crypto.randomBytes(8).toString('hex')}`, req.user!.id, targetUserId, `Reactivated account for ${targetUser.email}`);

    return res.json({ success: true, message: `Account reactivated successfully for ${targetUser.email}` });
  } catch (error: unknown) {
    console.error('Reactivate user error:', error);
    return res.status(500).json({ error: 'Failed to reactivate user' });
  }
});

// Admin Action: List All Revocation Requests
router.get('/revocation-requests', (_req: AuthRequest, res: Response) => {
  try {
    const requests = db.prepare(`
      SELECT r.*, u.email as user_email, u.full_name as user_name, u.role as user_role, u.status as user_status,
             s.reason as suspension_reason, s.created_at as suspended_at
      FROM revocation_requests r
      JOIN users u ON u.id = r.user_id
      LEFT JOIN account_suspensions s ON s.id = r.suspension_id
      ORDER BY r.created_at DESC
    `).all();

    return res.json({ requests });
  } catch (error: unknown) {
    console.error('Get revocation requests error:', error);
    return res.status(500).json({ error: 'Failed to load revocation requests' });
  }
});

// Admin Action: Review Revocation Request (Approve or Reject)
router.put('/revocation-requests/:id', (req: AuthRequest, res: Response) => {
  try {
    const { action, adminReply } = req.body;
    const requestId = req.params.id;

    if (action !== 'APPROVE' && action !== 'REJECT') {
      return res.status(400).json({ error: 'Action must be either APPROVE or REJECT' });
    }

    const request = db.prepare('SELECT * FROM revocation_requests WHERE id = ?').get(requestId) as {
      id: string;
      user_id: string;
      status: string;
    } | undefined;

    if (!request) {
      return res.status(404).json({ error: 'Revocation request not found' });
    }

    const newStatus = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';

    db.prepare(`
      UPDATE revocation_requests
      SET status = ?, admin_reply = ?, admin_id = ?, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(newStatus, adminReply?.trim() || null, req.user!.id, requestId);

    if (action === 'APPROVE') {
      // Re-enable user account to ACTIVE
      db.prepare("UPDATE users SET status = 'ACTIVE' WHERE id = ?").run(request.user_id);
      db.prepare("UPDATE account_suspensions SET status = 'RESOLVED' WHERE user_id = ? AND status = 'SUSPENDED'").run(request.user_id);

      // Notification
      db.prepare(`
        INSERT INTO notifications (id, user_id, title, message, type)
        VALUES (?, ?, 'Revocation Appeal Approved', ?, 'SYSTEM')
      `).run(
        `notif_${crypto.randomBytes(8).toString('hex')}`,
        request.user_id,
        `Your account revocation request has been approved by the administrator. Reason: ${adminReply || 'Account access restored.'}`
      );
    } else {
      // Rejection Notification
      db.prepare(`
        INSERT INTO notifications (id, user_id, title, message, type)
        VALUES (?, ?, 'Revocation Appeal Declined', ?, 'ALERT')
      `).run(
        `notif_${crypto.randomBytes(8).toString('hex')}`,
        request.user_id,
        `Your account revocation request has been declined. Remarks: ${adminReply || 'Policy guidelines violated.'}`
      );
    }

    // Audit log
    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details)
      VALUES (?, ?, 'REVOCATION_DECISION', 'USER', ?, ?)
    `).run(
      `log_${crypto.randomBytes(8).toString('hex')}`,
      req.user!.id,
      request.user_id,
      `Admin ${action}D revocation appeal ${requestId}. Reply: ${adminReply || 'None'}`
    );

    return res.json({ success: true, message: `Revocation request has been ${action.toLowerCase()}d.` });
  } catch (error: unknown) {
    console.error('Review revocation request error:', error);
    return res.status(500).json({ error: 'Failed to process revocation request' });
  }
});

// Admin Action: Manage 6 Database-Driven Pricing Plans
router.get('/pricing-plans', (_req: AuthRequest, res: Response) => {
  try {
    const rawPlans = db.prepare('SELECT * FROM pricing_plans ORDER BY sort_order ASC').all() as any[];
    const plans = rawPlans.map((p) => {
      let benefits: string[] = [];
      try {
        benefits = JSON.parse(p.benefits_json);
      } catch {
        benefits = [p.benefits_json];
      }
      return {
        ...p,
        benefits,
      };
    });
    return res.json({ plans });
  } catch (error: unknown) {
    console.error('Get admin pricing plans error:', error);
    return res.status(500).json({ error: 'Failed to load pricing plans' });
  }
});

router.put('/pricing-plans/:id', (req: AuthRequest, res: Response) => {
  try {
    const { name, billing_period, price_inr, original_price_inr, evaluation_allowance, student_capacity, unlimited_badge, badge, benefits, is_active } = req.body;
    const planId = req.params.id;

    const existing = db.prepare('SELECT id FROM pricing_plans WHERE id = ?').get(planId);
    if (!existing) {
      return res.status(404).json({ error: 'Pricing plan not found' });
    }

    const benefitsJson = Array.isArray(benefits) ? JSON.stringify(benefits) : JSON.stringify([benefits]);

    db.prepare(`
      UPDATE pricing_plans SET
        name = COALESCE(?, name),
        billing_period = COALESCE(?, billing_period),
        price_inr = COALESCE(?, price_inr),
        original_price_inr = ?,
        evaluation_allowance = COALESCE(?, evaluation_allowance),
        student_capacity = COALESCE(?, student_capacity),
        unlimited_badge = COALESCE(?, unlimited_badge),
        badge = ?,
        benefits_json = COALESCE(?, benefits_json),
        is_active = COALESCE(?, is_active),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      name || null,
      billing_period || null,
      price_inr !== undefined ? price_inr : null,
      original_price_inr !== undefined ? original_price_inr : null,
      evaluation_allowance !== undefined ? evaluation_allowance : null,
      student_capacity !== undefined ? student_capacity : null,
      unlimited_badge !== undefined ? unlimited_badge : null,
      badge !== undefined ? badge : null,
      benefits ? benefitsJson : null,
      is_active !== undefined ? is_active : null,
      planId
    );

    // Audit log
    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details)
      VALUES (?, ?, 'UPDATE_PRICING_PLAN', 'SYSTEM', ?, ?)
    `).run(`log_${crypto.randomBytes(8).toString('hex')}`, req.user!.id, planId, `Updated pricing plan ${planId}`);

    return res.json({ success: true, message: 'Pricing plan updated successfully' });
  } catch (error: unknown) {
    console.error('Update pricing plan error:', error);
    return res.status(500).json({ error: 'Failed to update pricing plan' });
  }
});

// 10. Courses & Syllabus
router.get('/courses', (req: AuthRequest, res: Response) => {
  try {
    const courses = [
      {
        id: 'FOUNDATION',
        name: 'CA Foundation',
        papersCount: 4,
        subjects: ['Accounting', 'Business Laws', 'Quantitative Aptitude', 'Business Economics'],
        passingRule: '40% in each subject & 50% aggregate',
      },
      {
        id: 'INTERMEDIATE',
        name: 'CA Intermediate',
        papersCount: 6,
        groups: [
          { group: 'Group 1', subjects: ['Advanced Accounting', 'Corporate and Other Laws', 'Taxation (Income Tax & GST)'] },
          { group: 'Group 2', subjects: ['Cost and Management Accounting', 'Auditing and Ethics', 'Financial Management and Strategic Management'] },
        ],
        passingRule: '40% per subject & 50% aggregate per group or both',
      },
      {
        id: 'FINAL',
        name: 'CA Final',
        papersCount: 6,
        groups: [
          { group: 'Group 1', subjects: ['Financial Reporting', 'Advanced Financial Management', 'Advanced Auditing, Assurance and Professional Ethics'] },
          { group: 'Group 2', subjects: ['Direct Tax Laws & International Taxation', 'Indirect Tax Laws', 'Integrated Business Solutions (Multi-Disciplinary)'] },
        ],
        passingRule: '40% per subject & 50% aggregate per group or both',
      },
    ];

    const materialsCount = db.prepare('SELECT level, COUNT(*) as count FROM evaluation_materials GROUP BY level').all() as Array<{ level: string; count: number }>;
    return res.json({ courses, materialsCount });
  } catch (error: unknown) {
    console.error('Get courses error:', error);
    return res.status(500).json({ error: 'Failed to load courses' });
  }
});

// 11. Subjects Management
router.get('/subjects', (req: AuthRequest, res: Response) => {
  try {
    const subjects = [
      // Foundation
      { key: 'found_accounting', name: 'Accounting', level: 'FOUNDATION', code: 'Paper 1', marks: 100 },
      { key: 'found_law', name: 'Business Laws', level: 'FOUNDATION', code: 'Paper 2', marks: 100 },
      { key: 'found_qa', name: 'Quantitative Aptitude', level: 'FOUNDATION', code: 'Paper 3', marks: 100 },
      { key: 'found_eco', name: 'Business Economics', level: 'FOUNDATION', code: 'Paper 4', marks: 100 },
      // Inter Group 1
      { key: 'inter_advanced_accounting', name: 'Advanced Accounting', level: 'INTERMEDIATE', group: 'GROUP_1', code: 'Paper 1', marks: 100 },
      { key: 'inter_law', name: 'Corporate and Other Laws', level: 'INTERMEDIATE', group: 'GROUP_1', code: 'Paper 2', marks: 100 },
      { key: 'inter_taxation', name: 'Taxation (Income Tax & GST)', level: 'INTERMEDIATE', group: 'GROUP_1', code: 'Paper 3', marks: 100 },
      // Inter Group 2
      { key: 'inter_costing', name: 'Cost and Management Accounting', level: 'INTERMEDIATE', group: 'GROUP_2', code: 'Paper 4', marks: 100 },
      { key: 'inter_audit', name: 'Auditing and Ethics', level: 'INTERMEDIATE', group: 'GROUP_2', code: 'Paper 5', marks: 100 },
      { key: 'inter_fmsm', name: 'Financial Management & Strategic Management', level: 'INTERMEDIATE', group: 'GROUP_2', code: 'Paper 6', marks: 100 },
      // Final Group 1
      { key: 'final_fr', name: 'Financial Reporting', level: 'FINAL', group: 'GROUP_1', code: 'Paper 1', marks: 100 },
      { key: 'final_afm', name: 'Advanced Financial Management', level: 'FINAL', group: 'GROUP_1', code: 'Paper 2', marks: 100 },
      { key: 'final_audit', name: 'Advanced Auditing, Assurance & Professional Ethics', level: 'FINAL', group: 'GROUP_1', code: 'Paper 3', marks: 100 },
      // Final Group 2
      { key: 'final_dt', name: 'Direct Tax Laws & International Taxation', level: 'FINAL', group: 'GROUP_2', code: 'Paper 4', marks: 100 },
      { key: 'final_idt', name: 'Indirect Tax Laws', level: 'FINAL', group: 'GROUP_2', code: 'Paper 5', marks: 100 },
      { key: 'final_ibs', name: 'Integrated Business Solutions', level: 'FINAL', group: 'GROUP_2', code: 'Paper 6', marks: 100 },
    ];

    const counts = db.prepare('SELECT subject_key, COUNT(*) as count FROM evaluation_materials GROUP BY subject_key').all() as Array<{ subject_key: string; count: number }>;
    const countsMap = Object.fromEntries(counts.map(c => [c.subject_key, c.count]));

    const enriched = subjects.map(s => ({
      ...s,
      papersUploaded: countsMap[s.key] || 0,
    }));

    return res.json({ subjects: enriched });
  } catch (error: unknown) {
    console.error('Get subjects error:', error);
    return res.status(500).json({ error: 'Failed to load subjects' });
  }
});

// 12. Papers Management
router.get('/papers', (req: AuthRequest, res: Response) => {
  try {
    const papers = db.prepare(`
      SELECT id, level, material_type, model_group, subject_key, subject_name, attempt,
             question_paper_title, uploaded_by, created_at,
             LENGTH(question_paper_text) as qp_chars,
             LENGTH(suggested_answers_text) as sa_chars
      FROM evaluation_materials
      ORDER BY created_at DESC
    `).all();
    return res.json({ papers });
  } catch (error: unknown) {
    console.error('Get papers error:', error);
    return res.status(500).json({ error: 'Failed to load papers' });
  }
});

// 13. Questions Repository
router.get('/questions', (req: AuthRequest, res: Response) => {
  try {
    const materials = db.prepare(`
      SELECT id, subject_name, level, attempt, question_paper_title, question_paper_text
      FROM evaluation_materials
      ORDER BY created_at DESC
    `).all() as Array<{ id: string; subject_name: string; level: string; attempt: string; question_paper_title: string; question_paper_text: string }>;

    const questionsList: any[] = [];
    for (const m of materials) {
      // Split questions by Q pattern
      const parts = m.question_paper_text.split(/(?=Q\d+\.?)/g);
      parts.forEach((p, idx) => {
        const trimmed = p.trim();
        if (trimmed.length > 20) {
          questionsList.push({
            id: `${m.id}_q_${idx + 1}`,
            paperId: m.id,
            paperTitle: m.question_paper_title,
            subject: m.subject_name,
            level: m.level,
            attempt: m.attempt,
            textPreview: trimmed.slice(0, 300) + (trimmed.length > 300 ? '...' : ''),
            fullText: trimmed,
          });
        }
      });
    }

    return res.json({ questions: questionsList });
  } catch (error: unknown) {
    console.error('Get questions error:', error);
    return res.status(500).json({ error: 'Failed to load questions' });
  }
});

// 14. Model Answers Management
router.get('/model-answers', (req: AuthRequest, res: Response) => {
  try {
    const modelAnswers = db.prepare(`
      SELECT id, level, subject_name, attempt, question_paper_title,
             suggested_answers_text, marking_scheme_text, created_at
      FROM evaluation_materials
      ORDER BY created_at DESC
    `).all();
    return res.json({ modelAnswers });
  } catch (error: unknown) {
    console.error('Get model answers error:', error);
    return res.status(500).json({ error: 'Failed to load model answers' });
  }
});

router.put('/model-answers/:id', (req: AuthRequest, res: Response) => {
  try {
    const { suggestedAnswersText, markingSchemeText } = req.body;
    db.prepare(`
      UPDATE evaluation_materials
      SET suggested_answers_text = COALESCE(?, suggested_answers_text),
          marking_scheme_text = COALESCE(?, marking_scheme_text)
      WHERE id = ?
    `).run(suggestedAnswersText || null, markingSchemeText || null, req.params.id);

    return res.json({ success: true, message: 'Model answer & marking scheme updated' });
  } catch (error: unknown) {
    console.error('Update model answer error:', error);
    return res.status(500).json({ error: 'Failed to update model answer' });
  }
});

// 15. Evaluations Management
router.get('/evaluations', (req: AuthRequest, res: Response) => {
  try {
    const { status, level, search, classification, source } = req.query;
    let query = `
      SELECT e.id, e.student_id, e.level, e.material_type, e.subject_key, e.subject_name,
             e.paper, e.attempt, e.evaluation_source, e.institute_id, e.sponsoring_institute_id,
             e.entitlement_source, e.checking_mode, e.total_marks, e.maximum_marks, e.percentage,
             e.grade, e.confidence_score, e.status, e.document_validation_status,
             e.original_filename, COALESCE(e.account_classification, 'NORMAL') as account_classification,
             e.created_at, e.completed_at,
             u.full_name as student_name, u.email as student_email,
             p.icai_registration_number,
             i.name as institute_name
      FROM evaluations e
      JOIN users u ON u.id = e.student_id
      LEFT JOIN student_profiles p ON p.user_id = u.id
      LEFT JOIN institutes i ON i.id = COALESCE(e.institute_id, e.sponsoring_institute_id)
      WHERE 1=1
    `;
    const params: any[] = [];

    if (status && status !== 'ALL') {
      query += ' AND e.status = ?';
      params.push(status);
    }
    if (level && level !== 'ALL') {
      query += ' AND e.level = ?';
      params.push(level);
    }
    if (classification && classification !== 'ALL') {
      query += " AND COALESCE(e.account_classification, 'NORMAL') = ?";
      params.push(classification);
    }
    if (source && source !== 'ALL') {
      query += ' AND e.evaluation_source = ?';
      params.push(source);
    }
    if (search) {
      query += ' AND (u.full_name LIKE ? OR u.email LIKE ? OR e.subject_name LIKE ? OR e.id LIKE ? OR e.paper LIKE ? OR i.name LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY e.created_at DESC LIMIT 300';
    const evaluations = db.prepare(query).all(...params);
    return res.json({ evaluations });
  } catch (error: unknown) {
    console.error('Get evaluations error:', error);
    return res.status(500).json({ error: 'Failed to load evaluations' });
  }
});

router.get('/evaluations/:id', (req: AuthRequest, res: Response) => {
  try {
    const evaluation = db.prepare(`
      SELECT e.*, u.full_name as student_name, u.email as student_email, p.icai_registration_number,
             i.name as institute_name
      FROM evaluations e
      JOIN users u ON u.id = e.student_id
      LEFT JOIN student_profiles p ON p.user_id = u.id
      LEFT JOIN institutes i ON i.id = COALESCE(e.institute_id, e.sponsoring_institute_id)
      WHERE e.id = ?
    `).get(req.params.id);

    if (!evaluation) {
      // Check if deleted
      const wasDeleted = db.prepare(`
        SELECT details, created_at FROM audit_logs
        WHERE entity_type = 'evaluations' AND entity_id = ? AND action = 'EVALUATION_DELETED'
        ORDER BY created_at DESC LIMIT 1
      `).get(req.params.id);

      if (wasDeleted) {
        return res.status(404).json({
          error: 'Evaluation no longer exists.',
          code: 'EVALUATION_DELETED',
          message: 'This evaluation record was permanently removed by Super Admin.'
        });
      }

      return res.status(404).json({ error: 'Evaluation not found' });
    }

    return res.json({ evaluation });
  } catch (error: unknown) {
    console.error('Get evaluation detail error:', error);
    return res.status(500).json({ error: 'Failed to load evaluation detail' });
  }
});

// View Evaluation Details for Inspection / Deletion Modal
router.get('/evaluations/:id/details', (req: AuthRequest, res: Response) => {
  try {
    const details = getEvaluationDetails(req.params.id, req.user!);
    return res.json(details);
  } catch (error: any) {
    console.error('Get evaluation inspection details error:', error);
    return res.status(error.statusCode || 500).json({
      error: error.message || 'Failed to load evaluation details',
      code: error.code || undefined,
    });
  }
});

// Delete Single Evaluation (Super Admin can delete ANY evaluation)
router.delete('/evaluations/:id', (req: AuthRequest, res: Response) => {
  try {
    const ipAddress = req.ip || (req.headers['x-forwarded-for'] as string) || null;
    const userAgent = (req.headers['user-agent'] as string) || null;
    const reason = (req.body?.reason || req.query?.reason || 'Administrative cleanup') as string;
    const notes = (req.body?.notes || req.query?.notes || '') as string;

    const result = deleteEvaluation(
      req.params.id,
      req.user!,
      { reason, notes },
      ipAddress,
      userAgent
    );
    return res.json(result);
  } catch (error: any) {
    console.error('Delete evaluation error:', error);
    return res.status(error.statusCode || 500).json({
      error: error.message || 'Failed to delete evaluation',
      code: error.code || undefined,
    });
  }
});

// Bulk Delete Evaluations (Super Admin)
router.post('/evaluations/bulk-delete', (req: AuthRequest, res: Response) => {
  try {
    const ipAddress = req.ip || (req.headers['x-forwarded-for'] as string) || null;
    const userAgent = (req.headers['user-agent'] as string) || null;
    const { evaluationIds, reason, notes } = req.body || {};

    if (!Array.isArray(evaluationIds) || evaluationIds.length === 0) {
      return res.status(400).json({ error: 'Please provide an array of evaluationIds to delete.' });
    }

    const result = bulkDeleteEvaluations(
      evaluationIds,
      req.user!,
      { reason: reason || 'Administrative cleanup', notes: notes || '' },
      ipAddress,
      userAgent
    );
    return res.json(result);
  } catch (error: any) {
    console.error('Bulk delete evaluations error:', error);
    return res.status(error.statusCode || 500).json({
      error: error.message || 'Failed to bulk delete evaluations',
      code: error.code || undefined,
    });
  }
});

// 16. Pricing Management
router.get('/pricing', (req: AuthRequest, res: Response) => {
  try {
    const settings = db.prepare('SELECT * FROM pricing_settings').all() as Array<{ key: string; value: string; description: string; updated_at: string }>;
    const settingsMap = Object.fromEntries(settings.map(s => [s.key, s.value]));

    return res.json({
      settings: settingsMap,
      rawList: settings,
    });
  } catch (error: unknown) {
    console.error('Get pricing error:', error);
    return res.status(500).json({ error: 'Failed to load pricing settings' });
  }
});

router.put('/pricing', (req: AuthRequest, res: Response) => {
  try {
    const { pricePerCredit, freeTierEvaluations, defaultInstituteQuota, supportEmail, instagramUrl } = req.body;

    const updates = [
      { key: 'PRICE_PER_CREDIT_INR', value: String(pricePerCredit || '10') },
      { key: 'FREE_TIER_EVALUATIONS', value: String(freeTierEvaluations || '2') },
      { key: 'DEFAULT_INSTITUTE_QUOTA', value: String(defaultInstituteQuota || '500') },
      { key: 'SUPPORT_EMAIL', value: String(supportEmail || 'caexamchecker.support@gmail.com') },
      { key: 'INSTAGRAM_URL', value: String(instagramUrl || 'https://insta.openinapp.co/utw2r') },
    ];

    for (const u of updates) {
      db.prepare(`
        INSERT INTO pricing_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
      `).run(u.key, u.value);
    }

    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details)
      VALUES (?, ?, 'UPDATE_PRICING', 'SYSTEM', 'PRICING', 'Updated system pricing settings')
    `).run(`log_${crypto.randomBytes(8).toString('hex')}`, req.user!.id);

    return res.json({ success: true, message: 'Pricing settings updated successfully' });
  } catch (error: unknown) {
    console.error('Update pricing error:', error);
    return res.status(500).json({ error: 'Failed to update pricing' });
  }
});

// 17. Subscriptions Management
router.get('/subscriptions', (req: AuthRequest, res: Response) => {
  try {
    const subscriptions = db.prepare(`
      SELECT i.id, i.name, i.code, i.email, i.phone, i.status,
             i.subscription_plan, i.subscription_expires_at, i.max_students,
             COUNT(m.id) as current_students,
             SUM(CASE WHEN m.status = 'ACTIVE' THEN 1 ELSE 0 END) as active_students
      FROM institutes i
      LEFT JOIN institute_memberships m ON m.institute_id = i.id
      GROUP BY i.id
      ORDER BY i.created_at DESC
    `).all();

    return res.json({ subscriptions });
  } catch (error: unknown) {
    console.error('Get subscriptions error:', error);
    return res.status(500).json({ error: 'Failed to load subscriptions' });
  }
});

router.put('/subscriptions/:id', (req: AuthRequest, res: Response) => {
  try {
    const { status, subscriptionPlan, subscriptionExpiresAt, maxStudents } = req.body;
    db.prepare(`
      UPDATE institutes
      SET status = COALESCE(?, status),
          subscription_plan = COALESCE(?, subscription_plan),
          subscription_expires_at = COALESCE(?, subscription_expires_at),
          max_students = COALESCE(?, max_students)
      WHERE id = ?
    `).run(status || null, subscriptionPlan || null, subscriptionExpiresAt || null, maxStudents || null, req.params.id);

    return res.json({ success: true, message: 'Institute subscription updated successfully' });
  } catch (error: unknown) {
    console.error('Update subscription error:', error);
    return res.status(500).json({ error: 'Failed to update subscription' });
  }
});

// 18. System Analytics
router.get('/analytics', (req: AuthRequest, res: Response) => {
  try {
    const levelStats = db.prepare(`
      SELECT level, COUNT(*) as evaluations_count, AVG(percentage) as average_percentage,
             SUM(CASE WHEN percentage >= 40 THEN 1 ELSE 0 END) as pass_count
      FROM evaluations
      WHERE status = 'COMPLETED'
      GROUP BY level
    `).all();

    const topSubjects = db.prepare(`
      SELECT subject_name, level, COUNT(*) as eval_count, AVG(percentage) as avg_score
      FROM evaluations
      WHERE status = 'COMPLETED'
      GROUP BY subject_name
      ORDER BY eval_count DESC
      LIMIT 10
    `).all();

    const monthlyRevenue = db.prepare(`
      SELECT strftime('%Y-%m', created_at) as month, SUM(amount_paise) / 100 as total_revenue, COUNT(*) as tx_count
      FROM payment_transactions
      WHERE status = 'SUCCESS'
      GROUP BY strftime('%Y-%m', created_at)
      ORDER BY month DESC
      LIMIT 6
    `).all();

    return res.json({
      levelStats,
      topSubjects,
      monthlyRevenue,
    });
  } catch (error: unknown) {
    console.error('Get analytics error:', error);
    return res.status(500).json({ error: 'Failed to load analytics' });
  }
});

// 19. System Notifications
router.get('/notifications', (req: AuthRequest, res: Response) => {
  try {
    const notifications = db.prepare(`
      SELECT n.*, u.email as user_email, u.full_name
      FROM notifications n
      JOIN users u ON u.id = n.user_id
      ORDER BY n.created_at DESC
      LIMIT 100
    `).all();
    return res.json({ notifications });
  } catch (error: unknown) {
    console.error('Get notifications error:', error);
    return res.status(500).json({ error: 'Failed to load notifications' });
  }
});

router.post('/notifications/broadcast', (req: AuthRequest, res: Response) => {
  try {
    const { title, message, targetRole } = req.body;
    if (!title || !message) {
      return res.status(400).json({ error: 'Title and message are required' });
    }

    let targetUsers: Array<{ id: string }>;
    if (targetRole && targetRole !== 'ALL') {
      targetUsers = db.prepare('SELECT id FROM users WHERE role = ?').all(targetRole) as Array<{ id: string }>;
    } else {
      targetUsers = db.prepare('SELECT id FROM users').all() as Array<{ id: string }>;
    }

    const insertStmt = db.prepare(`
      INSERT INTO notifications (id, user_id, title, message, type)
      VALUES (?, ?, ?, ?, 'SYSTEM')
    `);

    for (const u of targetUsers) {
      insertStmt.run(`notif_${crypto.randomBytes(8).toString('hex')}`, u.id, title, message);
    }

    return res.json({ success: true, message: `Broadcast sent to ${targetUsers.length} users` });
  } catch (error: unknown) {
    console.error('Broadcast notification error:', error);
    return res.status(500).json({ error: 'Failed to broadcast notification' });
  }
});

// 20. System Settings & Configuration Status
router.get('/settings', (req: AuthRequest, res: Response) => {
  try {
    const rzpConfigured = !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
    const geminiConfigured = !!process.env.GEMINI_API_KEY;

    return res.json({
      environment: {
        nodeEnv: process.env.NODE_ENV || 'development',
        port: 3000,
        database: 'SQLite (local WAL mode enabled)',
        razorpayConfigured: rzpConfigured,
        razorpayKeyIdSet: !!process.env.RAZORPAY_KEY_ID,
        razorpayKeySecretSet: !!process.env.RAZORPAY_KEY_SECRET,
        razorpayWebhookSecretSet: !!process.env.RAZORPAY_WEBHOOK_SECRET,
        geminiConfigured: geminiConfigured,
      },
      auditLogCount: (db.prepare('SELECT COUNT(*) as count FROM audit_logs').get() as any).count,
      totalUsers: (db.prepare('SELECT COUNT(*) as count FROM users').get() as any).count,
    });
  } catch (error: unknown) {
    console.error('Get settings error:', error);
    return res.status(500).json({ error: 'Failed to load system settings' });
  }
});

// 21. Exam Attempts Management (/admin/attempts)
router.get('/attempts', (req: AuthRequest, res: Response) => {
  try {
    const attempts = db.prepare(`
      SELECT * FROM exam_attempts ORDER BY year DESC, course ASC, id ASC
    `).all() as any[];

    return res.json({
      attempts: attempts.map((a) => ({
        id: a.id,
        course: a.course,
        month: a.month,
        year: a.year,
        displayName: a.display_name,
        syllabusVersion: a.syllabus_version,
        applicableMaterialVersion: a.applicable_material_version,
        isActive: Boolean(a.is_active),
        startDate: a.start_date,
        endDate: a.end_date,
      })),
    });
  } catch (error: unknown) {
    console.error('Get admin attempts error:', error);
    return res.status(500).json({ error: 'Failed to load attempts' });
  }
});

router.post('/attempts', (req: AuthRequest, res: Response) => {
  try {
    const { id, course, month, year, displayName, syllabusVersion, applicableMaterialVersion, isActive, startDate, endDate } = req.body;

    if (!id || !course || !month || !year || !displayName) {
      return res.status(400).json({ error: 'Please provide required fields: id, course, month, year, displayName.' });
    }

    db.prepare(`
      INSERT INTO exam_attempts (
        id, course, month, year, display_name, syllabus_version,
        applicable_material_version, is_active, start_date, end_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id.trim(),
      course.toUpperCase(),
      month.trim(),
      Number(year),
      displayName.trim(),
      syllabusVersion || 'New Scheme 2024',
      applicableMaterialVersion || '1.0',
      isActive !== undefined ? (isActive ? 1 : 0) : 1,
      startDate || null,
      endDate || null
    );

    return res.status(201).json({ success: true, message: 'Exam attempt created successfully' });
  } catch (error: unknown) {
    console.error('Create attempt error:', error);
    return res.status(500).json({ error: 'Failed to create attempt' });
  }
});

router.put('/attempts/:id', (req: AuthRequest, res: Response) => {
  try {
    const { course, month, year, displayName, syllabusVersion, applicableMaterialVersion, isActive, startDate, endDate } = req.body;

    db.prepare(`
      UPDATE exam_attempts
      SET course = COALESCE(?, course),
          month = COALESCE(?, month),
          year = COALESCE(?, year),
          display_name = COALESCE(?, display_name),
          syllabus_version = COALESCE(?, syllabus_version),
          applicable_material_version = COALESCE(?, applicable_material_version),
          is_active = COALESCE(?, is_active),
          start_date = COALESCE(?, start_date),
          end_date = COALESCE(?, end_date)
      WHERE id = ?
    `).run(
      course ? course.toUpperCase() : null,
      month || null,
      year ? Number(year) : null,
      displayName || null,
      syllabusVersion || null,
      applicableMaterialVersion || null,
      isActive !== undefined ? (isActive ? 1 : 0) : null,
      startDate || null,
      endDate || null,
      req.params.id
    );

    return res.json({ success: true, message: 'Exam attempt updated successfully' });
  } catch (error: unknown) {
    console.error('Update attempt error:', error);
    return res.status(500).json({ error: 'Failed to update attempt' });
  }
});

router.delete('/attempts/:id', (req: AuthRequest, res: Response) => {
  try {
    db.prepare('DELETE FROM exam_attempts WHERE id = ?').run(req.params.id);
    return res.json({ success: true, message: 'Attempt removed successfully' });
  } catch (error: unknown) {
    console.error('Delete attempt error:', error);
    return res.status(500).json({ error: 'Failed to delete attempt' });
  }
});

// 22. AI Configuration Settings (/admin/ai-settings)
router.get('/ai-settings', (req: AuthRequest, res: Response) => {
  try {
    const settings = db.prepare('SELECT key, value FROM pricing_settings').all() as Array<{ key: string; value: string }>;
    const map = Object.fromEntries(settings.map((s) => [s.key, s.value]));

    return res.json({
      settings: {
        primaryModel: map.EVAL_MODEL_PROVIDER || 'gemini-3.8-flash',
        fallbackModel: map.EVAL_FALLBACK_MODEL || 'gemini-3.6-flash',
        maxRetries: Number(map.EVAL_MAX_RETRIES) || 3,
        strictnessMode: map.EVAL_STRICTNESS_MODE || 'BALANCED',
        confidenceThreshold: Number(map.CONFIDENCE_THRESHOLD) || 85,
        geminiConfigured: !!process.env.GEMINI_API_KEY,
        availableModels: [
          { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash (Primary CA Evaluation)' },
          { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro Preview (Secondary Complex & Legal Reasoning)' },
          { id: 'gemini-3.7-flash', name: 'Gemini 3.7 Flash (Fast Review & MCQ Evaluator)' },
          { id: 'gemini-3.6-flash', name: 'Gemini 3.6 Flash (Primary Fallback Model)' },
          { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash (Secondary Fallback Model)' },
        ],
      },
    });
  } catch (error: unknown) {
    console.error('Get AI settings error:', error);
    return res.status(500).json({ error: 'Failed to load AI settings' });
  }
});

router.put('/ai-settings', (req: AuthRequest, res: Response) => {
  try {
    const { primaryModel, fallbackModel, maxRetries, strictnessMode, confidenceThreshold } = req.body;

    const upsertStmt = db.prepare(`
      INSERT INTO pricing_settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `);

    if (primaryModel) upsertStmt.run('EVAL_MODEL_PROVIDER', primaryModel);
    if (fallbackModel) upsertStmt.run('EVAL_FALLBACK_MODEL', fallbackModel);
    if (maxRetries !== undefined) upsertStmt.run('EVAL_MAX_RETRIES', String(maxRetries));
    if (strictnessMode) upsertStmt.run('EVAL_STRICTNESS_MODE', strictnessMode);
    if (confidenceThreshold !== undefined) upsertStmt.run('CONFIDENCE_THRESHOLD', String(confidenceThreshold));

    // Audit log
    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, details)
      VALUES (?, ?, 'UPDATE_AI_SETTINGS', 'SYSTEM', ?)
    `).run(
      `log_${crypto.randomBytes(8).toString('hex')}`,
      req.user!.id,
      `AI Settings updated: Primary=${primaryModel}, Fallback=${fallbackModel}, Retries=${maxRetries}`
    );

    return res.json({ success: true, message: 'AI configuration updated successfully.' });
  } catch (error: unknown) {
    console.error('Update AI settings error:', error);
    return res.status(500).json({ error: 'Failed to update AI settings' });
  }
});

// 23. Institute Pricing Plans Management (/admin/institute-plans)
router.get('/institute-plans', (req: AuthRequest, res: Response) => {
  try {
    const rawPlans = db.prepare('SELECT * FROM institute_plans ORDER BY sort_order ASC').all() as any[];
    const plans = rawPlans.map((p) => ({
      id: p.id,
      name: p.name,
      priceInr: p.price_inr,
      billingPeriod: p.billing_period,
      studentQuota: p.student_quota,
      evaluationCredits: p.evaluation_credits,
      features: JSON.parse(p.features_json || '[]'),
      assignmentsEnabled: Boolean(p.assignments_enabled),
      testsEnabled: Boolean(p.tests_enabled),
      analyticsEnabled: Boolean(p.analytics_enabled),
      supportTier: p.support_tier,
      isActive: Boolean(p.is_active),
      sortOrder: p.sort_order,
    }));
    return res.json({ plans });
  } catch (error: unknown) {
    console.error('Get admin institute plans error:', error);
    return res.status(500).json({ error: 'Failed to load institute plans' });
  }
});

router.post('/institute-plans', (req: AuthRequest, res: Response) => {
  try {
    const { id, name, priceInr, billingPeriod, studentQuota, evaluationCredits, features, assignmentsEnabled, testsEnabled, analyticsEnabled, supportTier, isActive, sortOrder } = req.body;

    if (!id || !name || priceInr === undefined) {
      return res.status(400).json({ error: 'Please provide required fields: id, name, priceInr.' });
    }

    db.prepare(`
      INSERT INTO institute_plans (
        id, name, price_inr, billing_period, student_quota, evaluation_credits,
        features_json, assignments_enabled, tests_enabled, analytics_enabled,
        support_tier, is_active, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id.trim(),
      name.trim(),
      Number(priceInr),
      billingPeriod || 'ANNUAL',
      Number(studentQuota) || 100,
      Number(evaluationCredits) || 500,
      JSON.stringify(Array.isArray(features) ? features : []),
      assignmentsEnabled ? 1 : 0,
      testsEnabled ? 1 : 0,
      analyticsEnabled ? 1 : 0,
      supportTier || 'Standard',
      isActive !== undefined ? (isActive ? 1 : 0) : 1,
      Number(sortOrder) || 1
    );

    return res.status(201).json({ success: true, message: 'Institute plan created successfully' });
  } catch (error: unknown) {
    console.error('Create institute plan error:', error);
    return res.status(500).json({ error: 'Failed to create plan' });
  }
});

router.put('/institute-plans/:id', (req: AuthRequest, res: Response) => {
  try {
    const { name, priceInr, billingPeriod, studentQuota, evaluationCredits, features, assignmentsEnabled, testsEnabled, analyticsEnabled, supportTier, isActive, sortOrder } = req.body;

    db.prepare(`
      UPDATE institute_plans
      SET name = COALESCE(?, name),
          price_inr = COALESCE(?, price_inr),
          billing_period = COALESCE(?, billing_period),
          student_quota = COALESCE(?, student_quota),
          evaluation_credits = COALESCE(?, evaluation_credits),
          features_json = COALESCE(?, features_json),
          assignments_enabled = COALESCE(?, assignments_enabled),
          tests_enabled = COALESCE(?, tests_enabled),
          analytics_enabled = COALESCE(?, analytics_enabled),
          support_tier = COALESCE(?, support_tier),
          is_active = COALESCE(?, is_active),
          sort_order = COALESCE(?, sort_order)
      WHERE id = ?
    `).run(
      name || null,
      priceInr !== undefined ? Number(priceInr) : null,
      billingPeriod || null,
      studentQuota !== undefined ? Number(studentQuota) : null,
      evaluationCredits !== undefined ? Number(evaluationCredits) : null,
      features ? JSON.stringify(features) : null,
      assignmentsEnabled !== undefined ? (assignmentsEnabled ? 1 : 0) : null,
      testsEnabled !== undefined ? (testsEnabled ? 1 : 0) : null,
      analyticsEnabled !== undefined ? (analyticsEnabled ? 1 : 0) : null,
      supportTier || null,
      isActive !== undefined ? (isActive ? 1 : 0) : null,
      sortOrder !== undefined ? Number(sortOrder) : null,
      req.params.id
    );

    return res.json({ success: true, message: 'Institute plan updated successfully' });
  } catch (error: unknown) {
    console.error('Update institute plan error:', error);
    return res.status(500).json({ error: 'Failed to update plan' });
  }
});

router.delete('/institute-plans/:id', (req: AuthRequest, res: Response) => {
  try {
    db.prepare('DELETE FROM institute_plans WHERE id = ?').run(req.params.id);
    return res.json({ success: true, message: 'Plan deleted successfully' });
  } catch (error: unknown) {
    console.error('Delete plan error:', error);
    return res.status(500).json({ error: 'Failed to delete plan' });
  }
});

// 24. Promo Code Management & Redemptions (/admin/promo-codes and /admin/referrals)
router.get(['/promo-codes', '/referrals'], (req: AuthRequest, res: Response) => {
  try {
    const rawCampaigns = db.prepare('SELECT * FROM referral_campaigns ORDER BY created_at DESC').all() as any[];
    const campaigns = rawCampaigns.map(c => {
      const redemptionsCount = (db.prepare(`
        SELECT COUNT(*) as cnt
        FROM referral_redemptions r
        LEFT JOIN users u ON u.id = r.user_id
        WHERE UPPER(r.referral_code) = UPPER(?)
          AND (u.account_classification IS NULL OR u.account_classification != 'TEST')
      `).get(c.code) as any)?.cnt || 0;
      const totalRawRedemptions = (db.prepare('SELECT COUNT(*) as cnt FROM referral_redemptions WHERE UPPER(referral_code) = UPPER(?)').get(c.code) as any)?.cnt || 0;
      const maxRedemptions = c.max_redemptions ?? 20;
      const remainingSlots = Math.max(0, maxRedemptions - redemptionsCount);
      
      let computedStatus = c.status || (c.is_active ? 'ACTIVE' : 'DISABLED');
      if (computedStatus === 'ACTIVE' && remainingSlots === 0) {
        computedStatus = 'EXHAUSTED';
      }

      return {
        ...c,
        code: c.code,
        campaignName: c.campaign_name,
        description: c.description || c.campaign_name,
        status: computedStatus,
        isActive: Boolean(c.is_active),
        maxRedemptions,
        successfulRedemptions: redemptionsCount,
        used_redemptions: redemptionsCount,
        totalRawRedemptions,
        remainingSlots,
        remainingRedemptions: remainingSlots,
        maxEvaluations: c.max_evaluations || 15,
        benefitDurationDays: c.benefit_duration_days || 30,
        validity_days: c.benefit_duration_days || 30,
        discount_type: c.benefit_type || '1_MONTH_FREE_ACCESS',
        startDate: c.start_date || null,
        endDate: c.end_date || null,
        userType: c.user_type || 'ALL',
        termsNotes: c.terms_notes || '',
        createdAt: c.created_at,
        updatedAt: c.updated_at,
      };
    });

    const redemptions = db.prepare(`
      SELECT r.*, u.full_name as user_name, u.email as user_email, u.account_classification
      FROM referral_redemptions r
      LEFT JOIN users u ON u.id = r.user_id
      ORDER BY r.redeemed_at DESC
    `).all();

    return res.json({ success: true, campaigns, redemptions });
  } catch (error: unknown) {
    console.error('Get promo codes error:', error);
    return res.status(500).json({ error: 'Failed to load promo code data' });
  }
});

// Create new promo code
router.post('/promo-codes', (req: AuthRequest, res: Response) => {
  try {
    const adminId = req.user!.id;
    const {
      code,
      campaignName,
      description,
      status = 'ACTIVE',
      maxRedemptions = 20,
      maxEvaluations = 15,
      benefitDurationDays = 30,
      startDate,
      endDate,
      userType = 'ALL',
      termsNotes,
    } = req.body;

    if (!code || typeof code !== 'string' || !code.trim()) {
      return res.status(400).json({ error: 'Promo code string is required.' });
    }

    const cleanCode = code.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{2,30}$/.test(cleanCode)) {
      return res.status(400).json({
        error: 'Promo code must be 2-30 characters containing only uppercase letters, numbers, hyphens, and underscores.',
      });
    }

    // Check uniqueness
    const existing = db.prepare('SELECT code FROM referral_campaigns WHERE UPPER(code) = UPPER(?)').get(cleanCode);
    if (existing) {
      return res.status(400).json({ error: `Promo code "${cleanCode}" already exists.` });
    }

    const cleanName = (campaignName || description || `${cleanCode} Promo Offer`).trim();
    const cleanDesc = (description || campaignName || `${cleanCode} Promotional Offer`).trim();
    const numMaxRedemptions = Math.max(1, parseInt(maxRedemptions, 10) || 20);
    const numMaxEvaluations = Math.max(1, parseInt(maxEvaluations, 10) || 15);
    const numDurationDays = Math.max(1, parseInt(benefitDurationDays, 10) || 30);
    const isActive = status === 'ACTIVE' ? 1 : 0;

    db.prepare(`
      INSERT INTO referral_campaigns (
        code, campaign_name, description, benefit_type, benefit_duration_days,
        max_redemptions, max_evaluations, is_active, status, start_date, end_date,
        user_type, terms_notes, created_at, updated_at
      ) VALUES (
        ?, ?, ?, '1_MONTH_FREE_ACCESS', ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `).run(
      cleanCode,
      cleanName,
      cleanDesc,
      numDurationDays,
      numMaxRedemptions,
      numMaxEvaluations,
      isActive,
      status,
      startDate ? new Date(startDate).toISOString() : null,
      endDate ? new Date(endDate).toISOString() : null,
      userType || 'ALL',
      termsNotes?.trim() || null
    );

    // Audit log
    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details)
      VALUES (?, ?, 'CREATE_PROMO_CODE', 'PROMO_CODE', ?, ?)
    `).run(
      `aud_${crypto.randomBytes(8).toString('hex')}`,
      adminId,
      cleanCode,
      JSON.stringify({
        code: cleanCode,
        campaignName: cleanName,
        maxRedemptions: numMaxRedemptions,
        maxEvaluations: numMaxEvaluations,
        benefitDurationDays: numDurationDays,
        status,
        userType,
      })
    );

    return res.status(201).json({
      success: true,
      message: `Promo code ${cleanCode} created successfully.`,
      code: cleanCode,
    });
  } catch (error: unknown) {
    console.error('Create promo code error:', error);
    return res.status(500).json({ error: 'Failed to create promo code' });
  }
});

// Update promo code parameters
router.put(['/promo-codes/:code', '/referrals/campaigns/:code'], (req: AuthRequest, res: Response) => {
  try {
    const adminId = req.user!.id;
    const campaignCode = req.params.code.toUpperCase();
    const {
      campaignName,
      description,
      maxRedemptions,
      maxEvaluations,
      benefitDurationDays,
      status,
      isActive,
      startDate,
      endDate,
      userType,
      termsNotes,
    } = req.body;

    const currentCampaign = db.prepare('SELECT * FROM referral_campaigns WHERE UPPER(code) = UPPER(?)').get(campaignCode) as any;
    if (!currentCampaign) {
      return res.status(404).json({ error: 'Promo code not found' });
    }

    const newStatus = status !== undefined ? status : (isActive !== undefined ? (isActive ? 'ACTIVE' : 'DISABLED') : currentCampaign.status);
    const newIsActive = newStatus === 'ACTIVE' ? 1 : 0;

    db.prepare(`
      UPDATE referral_campaigns
      SET campaign_name = COALESCE(?, campaign_name),
          description = COALESCE(?, description),
          max_redemptions = COALESCE(?, max_redemptions),
          max_evaluations = COALESCE(?, max_evaluations),
          benefit_duration_days = COALESCE(?, benefit_duration_days),
          status = COALESCE(?, status),
          is_active = ?,
          start_date = CASE WHEN ? = '__CLEAR__' THEN NULL WHEN ? IS NOT NULL THEN ? ELSE start_date END,
          end_date = CASE WHEN ? = '__CLEAR__' THEN NULL WHEN ? IS NOT NULL THEN ? ELSE end_date END,
          user_type = COALESCE(?, user_type),
          terms_notes = COALESCE(?, terms_notes),
          updated_at = CURRENT_TIMESTAMP
      WHERE UPPER(code) = UPPER(?)
    `).run(
      campaignName?.trim() || null,
      description?.trim() || null,
      maxRedemptions !== undefined ? Math.max(1, parseInt(maxRedemptions, 10)) : null,
      maxEvaluations !== undefined ? Math.max(1, parseInt(maxEvaluations, 10)) : null,
      benefitDurationDays !== undefined ? Math.max(1, parseInt(benefitDurationDays, 10)) : null,
      newStatus,
      newIsActive,
      startDate, startDate, startDate ? new Date(startDate).toISOString() : null,
      endDate, endDate, endDate ? new Date(endDate).toISOString() : null,
      userType || null,
      termsNotes !== undefined ? termsNotes?.trim() : null,
      campaignCode
    );

    // Audit log
    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details)
      VALUES (?, ?, 'UPDATE_PROMO_CODE', 'PROMO_CODE', ?, ?)
    `).run(
      `aud_${crypto.randomBytes(8).toString('hex')}`,
      adminId,
      campaignCode,
      JSON.stringify({
        previous: {
          max_redemptions: currentCampaign.max_redemptions,
          max_evaluations: currentCampaign.max_evaluations,
          benefit_duration_days: currentCampaign.benefit_duration_days,
          status: currentCampaign.status,
          is_active: currentCampaign.is_active,
        },
        updated: { maxRedemptions, maxEvaluations, benefitDurationDays, status: newStatus },
      })
    );

    return res.json({ success: true, message: `Promo code ${campaignCode} updated successfully.` });
  } catch (error: unknown) {
    console.error('Update promo code error:', error);
    return res.status(500).json({ error: 'Failed to update promo code' });
  }
});

// Quick toggle status: ACTIVE / DISABLED / ARCHIVED
router.patch('/promo-codes/:code/status', (req: AuthRequest, res: Response) => {
  try {
    const adminId = req.user!.id;
    const campaignCode = req.params.code.toUpperCase();
    const { status } = req.body;

    if (!['ACTIVE', 'DISABLED', 'ARCHIVED'].includes(status)) {
      return res.status(400).json({ error: 'Status must be ACTIVE, DISABLED, or ARCHIVED.' });
    }

    const currentCampaign = db.prepare('SELECT * FROM referral_campaigns WHERE UPPER(code) = UPPER(?)').get(campaignCode) as any;
    if (!currentCampaign) {
      return res.status(404).json({ error: 'Promo code not found' });
    }

    const isActive = status === 'ACTIVE' ? 1 : 0;
    db.prepare(`
      UPDATE referral_campaigns
      SET status = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
      WHERE UPPER(code) = UPPER(?)
    `).run(status, isActive, campaignCode);

    // Audit log
    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details)
      VALUES (?, ?, 'TOGGLE_PROMO_CODE_STATUS', 'PROMO_CODE', ?, ?)
    `).run(
      `aud_${crypto.randomBytes(8).toString('hex')}`,
      adminId,
      campaignCode,
      JSON.stringify({ previousStatus: currentCampaign.status, newStatus: status })
    );

    return res.json({ success: true, message: `Promo code ${campaignCode} status set to ${status}.` });
  } catch (error: unknown) {
    console.error('Toggle promo code status error:', error);
    return res.status(500).json({ error: 'Failed to toggle promo code status' });
  }
});

// Delete or Archive promo code
router.delete('/promo-codes/:code', (req: AuthRequest, res: Response) => {
  try {
    const adminId = req.user!.id;
    const campaignCode = req.params.code.toUpperCase();

    const currentCampaign = db.prepare('SELECT * FROM referral_campaigns WHERE UPPER(code) = UPPER(?)').get(campaignCode) as any;
    if (!currentCampaign) {
      return res.status(404).json({ error: 'Promo code not found' });
    }

    // Check if any redemptions exist
    const countRow = db.prepare(`
      SELECT COUNT(*) as total FROM referral_redemptions WHERE UPPER(referral_code) = UPPER(?)
    `).get(campaignCode) as { total: number };

    if (countRow.total > 0) {
      // Historical redemptions exist! Preserve records and archive rather than destructive delete
      db.prepare(`
        UPDATE referral_campaigns
        SET status = 'ARCHIVED', is_active = 0, updated_at = CURRENT_TIMESTAMP
        WHERE UPPER(code) = UPPER(?)
      `).run(campaignCode);

      db.prepare(`
        INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details)
        VALUES (?, ?, 'ARCHIVE_PROMO_CODE', 'PROMO_CODE', ?, ?)
      `).run(
        `aud_${crypto.randomBytes(8).toString('hex')}`,
        adminId,
        campaignCode,
        JSON.stringify({
          reason: 'Archived because historical redemptions exist',
          redemptionsCount: countRow.total,
        })
      );

      return res.json({
        success: true,
        archived: true,
        message: `Promo code "${campaignCode}" has ${countRow.total} student redemption record(s). It has been safely archived and disabled to preserve historical audit records.`,
      });
    }

    // No redemptions exist: safe destructive delete
    db.prepare('DELETE FROM referral_campaigns WHERE UPPER(code) = UPPER(?)').run(campaignCode);

    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details)
      VALUES (?, ?, 'DELETE_PROMO_CODE', 'PROMO_CODE', ?, ?)
    `).run(
      `aud_${crypto.randomBytes(8).toString('hex')}`,
      adminId,
      campaignCode,
      JSON.stringify({ message: 'Promo code deleted with 0 redemptions' })
    );

    return res.json({
      success: true,
      deleted: true,
      message: `Promo code "${campaignCode}" has been deleted.`,
    });
  } catch (error: unknown) {
    console.error('Delete promo code error:', error);
    return res.status(500).json({ error: 'Failed to delete promo code' });
  }
});

// View redemptions for a specific promo code
router.get('/promo-codes/:code/redemptions', (req: AuthRequest, res: Response) => {
  try {
    const campaignCode = req.params.code.toUpperCase();
    const redemptions = db.prepare(`
      SELECT r.*, u.full_name as user_name, u.email as user_email, u.account_classification
      FROM referral_redemptions r
      LEFT JOIN users u ON u.id = r.user_id
      WHERE UPPER(r.referral_code) = UPPER(?)
      ORDER BY r.redeemed_at DESC
    `).all(campaignCode);

    const campaign = db.prepare('SELECT * FROM referral_campaigns WHERE UPPER(code) = UPPER(?)').get(campaignCode);

    return res.json({
      success: true,
      code: campaignCode,
      campaign,
      totalRedemptions: redemptions.length,
      redemptions,
    });
  } catch (error: unknown) {
    console.error('Get promo redemptions error:', error);
    return res.status(500).json({ error: 'Failed to load promo code redemptions' });
  }
});

// 25. Support Tickets Management (/admin/support-tickets)
router.get('/support-tickets', (req: AuthRequest, res: Response) => {
  try {
    const { status, priority, role, search } = req.query;
    let query = 'SELECT * FROM support_tickets WHERE 1=1';
    const params: any[] = [];

    if (status && status !== 'ALL') {
      query += ' AND status = ?';
      params.push(status);
    }
    if (priority && priority !== 'ALL') {
      query += ' AND priority = ?';
      params.push(priority);
    }
    if (role && role !== 'ALL') {
      query += ' AND role = ?';
      params.push(role);
    }
    if (search) {
      query += ' AND (ticket_number LIKE ? OR name LIKE ? OR email LIKE ? OR subject LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY created_at DESC';
    const tickets = db.prepare(query).all(...params);

    return res.json({ tickets });
  } catch (error: unknown) {
    console.error('Get support tickets error:', error);
    return res.status(500).json({ error: 'Failed to load support tickets' });
  }
});

router.get('/support-tickets/:id', (req: AuthRequest, res: Response) => {
  try {
    const ticket = db.prepare('SELECT * FROM support_tickets WHERE id = ?').get(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    return res.json({ ticket });
  } catch (error: unknown) {
    console.error('Get ticket error:', error);
    return res.status(500).json({ error: 'Failed to load ticket' });
  }
});

router.put('/support-tickets/:id', (req: AuthRequest, res: Response) => {
  try {
    const { status, adminReply, resolutionNote, priority } = req.body;

    const existing = db.prepare('SELECT * FROM support_tickets WHERE id = ?').get(req.params.id) as any;
    if (!existing) return res.status(404).json({ error: 'Ticket not found' });

    const isResolved = status === 'RESOLVED' || status === 'CLOSED';
    const resolvedAt = isResolved ? new Date().toISOString() : existing.resolved_at;

    db.prepare(`
      UPDATE support_tickets
      SET status = COALESCE(?, status),
          admin_reply = COALESCE(?, admin_reply),
          resolution_note = COALESCE(?, resolution_note),
          priority = COALESCE(?, priority),
          resolved_at = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      status || null,
      adminReply || null,
      resolutionNote || null,
      priority || null,
      resolvedAt,
      req.params.id
    );

    // Notify user if ticket is tied to a user account
    if (existing.user_id && (adminReply || isResolved)) {
      const notifMessage = isResolved
        ? `Your support ticket #${existing.ticket_number || req.params.id.slice(0, 8)} has been marked as ${status}. Resolution: ${resolutionNote || adminReply || 'Your issue has been resolved by our support team.'}`
        : `Admin reply on ticket #${existing.ticket_number || req.params.id.slice(0, 8)}: ${adminReply}`;

      db.prepare(`
        INSERT INTO notifications (id, user_id, title, message, type)
        VALUES (?, ?, ?, ?, 'SYSTEM')
      `).run(
        `notif_${crypto.randomBytes(8).toString('hex')}`,
        existing.user_id,
        `Support Ticket Update (#${existing.ticket_number || 'Support'})`,
        notifMessage
      );
    }

    return res.json({ success: true, message: 'Ticket updated successfully' });
  } catch (error: unknown) {
    console.error('Update ticket error:', error);
    return res.status(500).json({ error: 'Failed to update ticket' });
  }
});

// Support route aliases
router.get('/support', (req: AuthRequest, res: Response, next) => {
  req.url = '/support-tickets';
  (router as any).handle(req, res, next);
});

router.put('/support/:id', (req: AuthRequest, res: Response, next) => {
  req.url = `/support-tickets/${req.params.id}`;
  (router as any).handle(req, res, next);
});

// ==========================================
// 19. PLUGGABLE AI MODEL ARCHITECTURE & CONTROLS
// ==========================================
router.get('/models', (req: AuthRequest, res: Response) => {
  try {
    const models = db.prepare(`
      SELECT * FROM model_configs ORDER BY is_primary DESC, fallback_order ASC, display_name ASC
    `).all() as any[];

    // Provider environment availability check
    const geminiKey = process.env.GEMINI_API_KEY || '';
    const openaiKey = process.env.OPENAI_API_KEY || '';
    const anthropicKey = process.env.ANTHROPIC_API_KEY || '';

    const providerStatus = {
      gemini: {
        configured: Boolean(geminiKey && geminiKey.length > 5),
        keyMasked: geminiKey ? `${geminiKey.slice(0, 4)}...${geminiKey.slice(-4)}` : 'Not Configured',
      },
      openai: {
        configured: Boolean(openaiKey && openaiKey.length > 5),
        keyMasked: openaiKey ? `${openaiKey.slice(0, 4)}...${openaiKey.slice(-4)}` : 'Not Configured',
      },
      anthropic: {
        configured: Boolean(anthropicKey && anthropicKey.length > 5),
        keyMasked: anthropicKey ? `${anthropicKey.slice(0, 4)}...${anthropicKey.slice(-4)}` : 'Not Configured',
      },
    };

    return res.json({
      models,
      providerStatus,
    });
  } catch (error: unknown) {
    console.error('Get models error:', error);
    return res.status(500).json({ error: 'Failed to load model configurations' });
  }
});

router.put('/models/:id', (req: AuthRequest, res: Response) => {
  try {
    const modelId = req.params.id;
    const { is_primary, fallback_order, is_enabled, role, thinking_level, temperature, top_p, max_tokens, custom_endpoint } = req.body;

    const existing = db.prepare('SELECT * FROM model_configs WHERE id = ?').get(modelId) as any;
    if (!existing) {
      return res.status(404).json({ error: 'Model configuration not found' });
    }

    if (is_primary === 1 || is_primary === true) {
      // Clear other primaries
      db.prepare('UPDATE model_configs SET is_primary = 0').run();
      db.prepare('UPDATE model_configs SET is_primary = 1, is_enabled = 1 WHERE id = ?').run(modelId);
      // Sync with pricing_settings EVAL_MODEL_PROVIDER
      db.prepare(`
        INSERT INTO pricing_settings (key, value, updated_at)
        VALUES ('EVAL_MODEL_PROVIDER', ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
      `).run(modelId);
    }

    if (role !== undefined) {
      db.prepare('UPDATE model_configs SET role = ? WHERE id = ?').run(String(role), modelId);
    }

    if (thinking_level !== undefined) {
      db.prepare('UPDATE model_configs SET thinking_level = ? WHERE id = ?').run(String(thinking_level), modelId);
    }

    if (fallback_order !== undefined) {
      db.prepare('UPDATE model_configs SET fallback_order = ? WHERE id = ?').run(Number(fallback_order), modelId);
    }

    if (is_enabled !== undefined && !is_primary) {
      db.prepare('UPDATE model_configs SET is_enabled = ? WHERE id = ?').run(is_enabled ? 1 : 0, modelId);
    }

    if (temperature !== undefined) {
      db.prepare('UPDATE model_configs SET temperature = ? WHERE id = ?').run(Number(temperature), modelId);
    }

    if (top_p !== undefined) {
      db.prepare('UPDATE model_configs SET top_p = ? WHERE id = ?').run(Number(top_p), modelId);
    }

    if (max_tokens !== undefined) {
      db.prepare('UPDATE model_configs SET max_tokens = ? WHERE id = ?').run(Number(max_tokens), modelId);
    }

    if (custom_endpoint !== undefined) {
      db.prepare('UPDATE model_configs SET custom_endpoint = ? WHERE id = ?').run(custom_endpoint || null, modelId);
    }

    // Audit log
    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details)
      VALUES (?, ?, 'UPDATE_MODEL_CONFIG', 'AI_MODEL', ?, ?)
    `).run(
      `log_${crypto.randomBytes(8).toString('hex')}`,
      req.user!.id,
      modelId,
      `Updated model configuration for ${modelId} (Primary: ${Boolean(is_primary)})`
    );

    const updated = db.prepare('SELECT * FROM model_configs WHERE id = ?').get(modelId);
    return res.json({ success: true, model: updated });
  } catch (error: unknown) {
    console.error('Update model error:', error);
    return res.status(500).json({ error: 'Failed to update model configuration' });
  }
});

router.post('/models/test-connection', async (req: AuthRequest, res: Response) => {
  try {
    const { modelId } = req.body;
    if (!modelId) {
      return res.status(400).json({ error: 'modelId is required' });
    }

    const { testModelConnection } = await import('../models/modelRegistry.js');
    const result = await testModelConnection(modelId);
    return res.json(result);
  } catch (error: any) {
    console.error('Test model connection error:', error);
    return res.status(500).json({
      success: false,
      message: error?.message || 'Connection test failed',
    });
  }
});

router.get('/models/telemetry', (req: AuthRequest, res: Response) => {
  try {
    // Aggregated stats from evaluations
    const providerStats = db.prepare(`
      SELECT
        COALESCE(model_provider, 'gemini') as provider,
        COALESCE(model_used, 'gemini-3.8-flash') as model,
        COUNT(*) as total_evaluations,
        SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as successful_evaluations,
        SUM(CASE WHEN fallback_occurred = 1 THEN 1 ELSE 0 END) as fallback_count,
        ROUND(AVG(CASE WHEN latency_ms > 0 THEN latency_ms ELSE NULL END), 0) as avg_latency_ms,
        SUM(COALESCE(prompt_tokens, 0)) as total_prompt_tokens,
        SUM(COALESCE(completion_tokens, 0)) as total_completion_tokens,
        SUM(COALESCE(total_tokens, 0)) as total_tokens
      FROM evaluations
      WHERE status IN ('COMPLETED', 'FAILED')
      GROUP BY model_provider, model_used
      ORDER BY total_evaluations DESC
    `).all();

    const overallStats = db.prepare(`
      SELECT
        COUNT(*) as total_evaluations,
        SUM(CASE WHEN fallback_occurred = 1 THEN 1 ELSE 0 END) as total_fallbacks,
        ROUND(AVG(CASE WHEN latency_ms > 0 THEN latency_ms ELSE NULL END), 0) as global_avg_latency_ms,
        SUM(COALESCE(total_tokens, 0)) as total_tokens_used
      FROM evaluations
      WHERE status = 'COMPLETED'
    `).get();

    return res.json({
      overallStats,
      providerStats,
    });
  } catch (error: unknown) {
    console.error('Get model telemetry error:', error);
    return res.status(500).json({ error: 'Failed to load model telemetry' });
  }
});

// ==========================================
// Configurable Paper-Specific MCQ Scoring Rules
// ==========================================
router.get('/mcq-scoring-rules', (req: AuthRequest, res: Response) => {
  try {
    const rules = getAllMcqRules();
    const mapped = rules.map((r) => ({
      ...r,
      courseLevel: r.course_level,
      paperNumber: r.paper_number,
      paperName: r.paper_name,
      syllabusVersion: r.syllabus_version,
      wrongPenalty: r.wrong_penalty,
      correctScoreRule: r.correct_score_rule,
      unattemptedScoreRule: r.unattempted_score_rule,
      isActive: Boolean(r.is_active),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
    return res.json({ success: true, rules: mapped });
  } catch (error: unknown) {
    console.error('Get MCQ scoring rules error:', error);
    return res.status(500).json({ error: 'Failed to retrieve MCQ scoring rules' });
  }
});

router.post('/mcq-scoring-rules', (req: AuthRequest, res: Response) => {
  try {
    const {
      courseLevel,
      course_level,
      paperNumber,
      paper_number,
      paperName,
      paper_name,
      attempt,
      syllabusVersion,
      syllabus_version,
      wrongPenalty,
      wrong_penalty,
      correctScoreRule,
      correct_score_rule,
      unattemptedScoreRule,
      unattempted_score_rule,
      isActive,
      is_active,
      description,
    } = req.body;

    const rawLevel = courseLevel || course_level;
    const rawPaperName = paperName || paper_name;
    const rawPaperNumber = paperNumber || paper_number;
    const rawSyllabus = syllabusVersion || syllabus_version;
    const rawCorrect = correctScoreRule || correct_score_rule;
    const rawUnattempted = unattemptedScoreRule || unattempted_score_rule;
    const rawActive = isActive !== undefined ? isActive : is_active;
    const rawPenalty = wrongPenalty !== undefined ? wrongPenalty : wrong_penalty;

    if (!rawLevel || !rawPaperName) {
      return res.status(400).json({ error: 'Course Level and Paper/Subject Name are required.' });
    }

    const normLevel = String(rawLevel).toUpperCase().trim();
    if (!['FOUNDATION', 'INTERMEDIATE', 'FINAL'].includes(normLevel)) {
      return res.status(400).json({ error: 'Course Level must be FOUNDATION, INTERMEDIATE, or FINAL.' });
    }

    const canonicalName = normLevel === 'FOUNDATION'
      ? getCanonicalPaperName(normLevel, rawPaperName)
      : String(rawPaperName).trim();

    const penaltyNum = typeof rawPenalty === 'number' ? rawPenalty : parseFloat(rawPenalty) || 0;

    // Strict safety constraint: -0.25 negative marking permitted ONLY when BOTH conditions are true:
    // Level = FOUNDATION AND Paper is Quantitative Aptitude or Business Economics
    if (penaltyNum < 0) {
      const isAllowed = normLevel === 'FOUNDATION' && (canonicalName === 'Quantitative Aptitude' || canonicalName === 'Business Economics');
      if (!isAllowed) {
        return res.status(400).json({
          error: 'Negative marking (-0.25) under ICAI rules is permitted ONLY for CA Foundation Quantitative Aptitude and Business Economics. All other papers and levels must be 0.',
        });
      }
    }

    const ruleId = `mcq_rule_${crypto.randomBytes(8).toString('hex')}`;
    const activeInt = rawActive === false || rawActive === 0 ? 0 : 1;

    db.prepare(`
      INSERT INTO mcq_scoring_rules (
        id, course_level, paper_number, paper_name, attempt, syllabus_version,
        wrong_penalty, correct_score_rule, unattempted_score_rule, is_active, description,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      ruleId,
      normLevel,
      rawPaperNumber || 'ALL',
      canonicalName,
      attempt || 'ALL',
      rawSyllabus || 'ALL',
      penaltyNum,
      rawCorrect || 'FULL_MARKS',
      rawUnattempted || 'ZERO',
      activeInt,
      description || `MCQ Rule for CA ${normLevel} ${canonicalName}`
    );

    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, details)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      `log_${crypto.randomBytes(8).toString('hex')}`,
      req.user!.id,
      'CREATE_MCQ_SCORING_RULE',
      'mcq_scoring_rules',
      `Created MCQ scoring rule for ${normLevel} - ${canonicalName} (Wrong: ${penaltyNum})`
    );

    return res.status(201).json({ success: true, message: 'MCQ scoring rule created successfully', ruleId });
  } catch (error: unknown) {
    console.error('Create MCQ scoring rule error:', error);
    return res.status(500).json({ error: 'Failed to create MCQ scoring rule' });
  }
});

router.put('/mcq-scoring-rules/:id', (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM mcq_scoring_rules WHERE id = ?').get(id) as any;
    if (!existing) {
      return res.status(404).json({ error: 'MCQ scoring rule not found' });
    }

    const {
      courseLevel,
      course_level,
      paperNumber,
      paper_number,
      paperName,
      paper_name,
      attempt,
      syllabusVersion,
      syllabus_version,
      wrongPenalty,
      wrong_penalty,
      correctScoreRule,
      correct_score_rule,
      unattemptedScoreRule,
      unattempted_score_rule,
      isActive,
      is_active,
      description,
    } = req.body;

    const rawLevel = courseLevel || course_level;
    const rawPaperName = paperName || paper_name;
    const rawPaperNumber = paperNumber || paper_number;
    const rawSyllabus = syllabusVersion || syllabus_version;
    const rawCorrect = correctScoreRule || correct_score_rule;
    const rawUnattempted = unattemptedScoreRule || unattempted_score_rule;
    const rawActive = isActive !== undefined ? isActive : is_active;
    const rawPenalty = wrongPenalty !== undefined ? wrongPenalty : wrong_penalty;

    const normLevel = rawLevel ? String(rawLevel).toUpperCase().trim() : existing.course_level;
    const effectivePaperName = rawPaperName
      ? (normLevel === 'FOUNDATION' ? getCanonicalPaperName(normLevel, rawPaperName) : String(rawPaperName).trim())
      : existing.paper_name;

    const penaltyNum = rawPenalty !== undefined
      ? (typeof rawPenalty === 'number' ? rawPenalty : parseFloat(rawPenalty) || 0)
      : existing.wrong_penalty;

    // Strict safety constraint check
    if (penaltyNum < 0) {
      const isAllowed = normLevel === 'FOUNDATION' && (effectivePaperName === 'Quantitative Aptitude' || effectivePaperName === 'Business Economics');
      if (!isAllowed) {
        return res.status(400).json({
          error: 'Negative marking (-0.25) under ICAI rules is permitted ONLY for CA Foundation Quantitative Aptitude and Business Economics. All other papers and levels must be 0.',
        });
      }
    }

    const activeInt = rawActive !== undefined ? (rawActive ? 1 : 0) : existing.is_active;

    db.prepare(`
      UPDATE mcq_scoring_rules
      SET course_level = ?,
          paper_number = ?,
          paper_name = ?,
          attempt = ?,
          syllabus_version = ?,
          wrong_penalty = ?,
          correct_score_rule = ?,
          unattempted_score_rule = ?,
          is_active = ?,
          description = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      normLevel,
      rawPaperNumber !== undefined ? rawPaperNumber : existing.paper_number,
      effectivePaperName,
      attempt !== undefined ? attempt : existing.attempt,
      rawSyllabus !== undefined ? rawSyllabus : existing.syllabus_version,
      penaltyNum,
      rawCorrect || existing.correct_score_rule,
      rawUnattempted || existing.unattempted_score_rule,
      activeInt,
      description !== undefined ? description : existing.description,
      id
    );

    return res.json({ success: true, message: 'MCQ scoring rule updated successfully' });
  } catch (error: unknown) {
    console.error('Update MCQ scoring rule error:', error);
    return res.status(500).json({ error: 'Failed to update MCQ scoring rule' });
  }
});

router.delete('/mcq-scoring-rules/:id', (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM mcq_scoring_rules WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'MCQ scoring rule not found' });
    }

    db.prepare('DELETE FROM mcq_scoring_rules WHERE id = ?').run(id);

    return res.json({ success: true, message: 'MCQ scoring rule deleted successfully' });
  } catch (error: unknown) {
    console.error('Delete MCQ scoring rule error:', error);
    return res.status(500).json({ error: 'Failed to delete MCQ scoring rule' });
  }
});

router.post('/mcq-scoring-rules/reset-defaults', (req: AuthRequest, res: Response) => {
  try {
    resetDefaultMcqRules();

    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, details)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      `log_${crypto.randomBytes(8).toString('hex')}`,
      req.user!.id,
      'RESET_MCQ_SCORING_RULES',
      'mcq_scoring_rules',
      'Reset all MCQ scoring rules to official ICAI default configuration'
    );

    const rules = getAllMcqRules();
    return res.json({ success: true, message: 'MCQ scoring rules reset to official ICAI default configuration', rules });
  } catch (error: unknown) {
    console.error('Reset MCQ scoring rules error:', error);
    return res.status(500).json({ error: 'Failed to reset MCQ scoring rules' });
  }
});

// Cloud Storage Inspection & Verification (Architecture Requirement)
router.get('/cloud-storage/status', async (req: AuthRequest, res: Response) => {
  try {
    const { inspectCloudStorageStatus } = await import('../services/firebaseCloudStorageService.js');
    const status = await inspectCloudStorageStatus();
    return res.json({ success: true, ...status });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: 'Failed to inspect Cloud Storage status', details: msg });
  }
});

// Run End-to-End Cloud Storage Persistence Test
router.post('/cloud-storage/test-e2e', async (req: AuthRequest, res: Response) => {
  try {
    const { runEndToEndPersistenceTest } = await import('../scripts/testE2ECloudStorage.js');
    const testResult = await runEndToEndPersistenceTest();
    return res.json({ success: testResult.success, ...testResult });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ success: false, error: 'E2E test failed', details: msg });
  }
});

export default router;
