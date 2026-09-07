import { Router, Response } from 'express';
import crypto from 'node:crypto';
import { db } from '../db.js';
import { authenticateToken, requireRole, AuthRequest } from '../auth.js';

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
    const { status } = req.body;

    if (!['ACTIVE', 'SUSPENDED', 'BLOCKED'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, userId);

    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details)
      VALUES (?, ?, 'USER_STATUS_CHANGE', 'USER', ?, ?)
    `).run(
      `log_${crypto.randomBytes(8).toString('hex')}`,
      req.user!.id,
      userId,
      `Changed status to ${status}`
    );

    return res.json({ success: true, message: `User status set to ${status}` });
  } catch (error: unknown) {
    console.error('Update user status error:', error);
    return res.status(500).json({ error: 'Failed to update user status' });
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

    const newBalance = Math.max(0, profile.purchased_credits + delta);
    db.prepare('UPDATE student_profiles SET purchased_credits = ? WHERE user_id = ?').run(newBalance, studentId);

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
    const materials = db.prepare(`
      SELECT id, level, material_type, model_group, subject_key, subject_name,
             attempt, question_paper_title, uploaded_by, created_at,
             LENGTH(question_paper_text) as qp_chars,
             LENGTH(suggested_answers_text) as sa_chars
      FROM evaluation_materials
      ORDER BY created_at DESC
    `).all();
    return res.json({ materials });
  } catch (error: unknown) {
    console.error('Get materials error:', error);
    return res.status(500).json({ error: 'Failed to load reference materials' });
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
      attempt,
      questionPaperTitle,
      questionPaperText,
      suggestedAnswersText,
      markingSchemeText,
    } = req.body;

    if (!level || !materialType || !subjectKey || !subjectName || !questionPaperTitle || !questionPaperText || !suggestedAnswersText) {
      return res.status(400).json({ error: 'Please provide all material fields including Question Paper and Suggested Answers text.' });
    }

    const materialId = `mat_${crypto.randomBytes(8).toString('hex')}`;
    db.prepare(`
      INSERT INTO evaluation_materials (
        id, level, material_type, model_group, subject_key, subject_name,
        attempt, question_paper_title, question_paper_text, suggested_answers_text,
        marking_scheme_text, uploaded_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      materialId,
      level,
      materialType,
      modelGroup || null,
      subjectKey,
      subjectName,
      attempt || 'Current',
      questionPaperTitle.trim(),
      questionPaperText.trim(),
      suggestedAnswersText.trim(),
      markingSchemeText?.trim() || '',
      req.user!.email
    );

    return res.status(201).json({ success: true, materialId, message: 'Reference material uploaded successfully.' });
  } catch (error: unknown) {
    console.error('Upload material error:', error);
    return res.status(500).json({ error: 'Failed to save evaluation material' });
  }
});

router.delete('/materials/:id', (req: AuthRequest, res: Response) => {
  try {
    db.prepare('DELETE FROM evaluation_materials WHERE id = ?').run(req.params.id);
    return res.json({ success: true, message: 'Material deleted successfully' });
  } catch (error: unknown) {
    console.error('Delete material error:', error);
    return res.status(500).json({ error: 'Failed to delete material' });
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

// 6. Payments & Transactions
router.get('/payments', (req: AuthRequest, res: Response) => {
  try {
    const orders = db.prepare(`
      SELECT o.*, u.full_name as student_name, u.email as student_email,
             t.razorpay_payment_id, t.created_at as paid_at
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
    const { search, caLevel } = req.query;
    let query = `
      SELECT u.id, u.email, u.full_name, u.phone, u.status, u.created_at,
             p.icai_registration_number, p.ca_level, p.free_evaluations_used, p.purchased_credits,
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

    query += ' GROUP BY u.id ORDER BY u.created_at DESC LIMIT 200';
    const students = db.prepare(query).all(...params);
    return res.json({ students });
  } catch (error: unknown) {
    console.error('Get students error:', error);
    return res.status(500).json({ error: 'Failed to retrieve students' });
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
    const { status, level, search } = req.query;
    let query = `
      SELECT e.id, e.student_id, e.level, e.material_type, e.subject_key, e.subject_name,
             e.attempt, e.checking_mode, e.total_marks, e.maximum_marks, e.percentage,
             e.grade, e.confidence_score, e.status, e.document_validation_status,
             e.original_filename, e.created_at, e.completed_at,
             u.full_name as student_name, u.email as student_email,
             p.icai_registration_number
      FROM evaluations e
      JOIN users u ON u.id = e.student_id
      LEFT JOIN student_profiles p ON p.user_id = u.id
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
    if (search) {
      query += ' AND (u.full_name LIKE ? OR u.email LIKE ? OR e.subject_name LIKE ? OR e.id LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY e.created_at DESC LIMIT 150';
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
      SELECT e.*, u.full_name as student_name, u.email as student_email, p.icai_registration_number
      FROM evaluations e
      JOIN users u ON u.id = e.student_id
      LEFT JOIN student_profiles p ON p.user_id = u.id
      WHERE e.id = ?
    `).get(req.params.id);

    if (!evaluation) {
      return res.status(404).json({ error: 'Evaluation not found' });
    }

    return res.json({ evaluation });
  } catch (error: unknown) {
    console.error('Get evaluation detail error:', error);
    return res.status(500).json({ error: 'Failed to load evaluation detail' });
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

export default router;
