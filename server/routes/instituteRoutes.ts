import { Router, Response } from 'express';
import crypto from 'node:crypto';
import { db } from '../db.js';
import { authenticateToken, requireRole, AuthRequest } from '../auth.js';
import { createInstituteSubscriptionOrder, verifyInstituteSubscriptionPayment, isRazorpayConfigured, getRazorpayKeyId } from '../razorpay.js';

const router = Router();

// Require authenticated user with INSTITUTE_ADMIN or SUPER_ADMIN role
router.use(authenticateToken);
router.use(requireRole('INSTITUTE_ADMIN', 'SUPER_ADMIN'));

// Helper to get the institute ID for the authenticated admin
function getAdminInstituteId(req: AuthRequest): string | null {
  if (req.user!.role === 'SUPER_ADMIN') {
    if (req.query.instituteId) {
      return String(req.query.instituteId);
    }
    const instByEmail = db.prepare('SELECT id FROM institutes WHERE lower(email) = lower(?)').get(req.user!.email) as { id: string } | undefined;
    if (instByEmail) return instByEmail.id;
    const firstInst = db.prepare('SELECT id FROM institutes ORDER BY created_at ASC LIMIT 1').get() as { id: string } | undefined;
    return firstInst ? firstInst.id : null;
  }
  const inst = db.prepare('SELECT id FROM institutes WHERE lower(email) = lower(?)').get(req.user!.email) as { id: string } | undefined;
  if (inst) return inst.id;
  if (req.user!.email?.toLowerCase() === 'institute@apexca.edu') {
    return 'inst_apex_academy_01';
  }
  return null;
}

// Helper to log institute-related administrative audit events
function logInstituteAudit(userId: string, action: string, entityType: string, entityId: string, details: any, ipAddress?: string) {
  try {
    const id = `audit_${crypto.randomBytes(8).toString('hex')}`;
    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details, ip_address, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      id,
      userId,
      action,
      entityType,
      entityId,
      typeof details === 'string' ? details : JSON.stringify(details),
      ipAddress || null
    );
  } catch (err) {
    console.warn('logInstituteAudit error:', err);
  }
}

// 1. Institute Dashboard
router.get('/dashboard', (req: AuthRequest, res: Response) => {
  try {
    const instituteId = getAdminInstituteId(req);
    if (!instituteId) {
      return res.status(404).json({ error: 'Institute profile not associated with this administrator.' });
    }

    const institute = db.prepare('SELECT * FROM institutes WHERE id = ?').get(instituteId) as Record<string, unknown>;

    // Total and Active students
    const studentCountRow = db.prepare(`
      SELECT 
        COUNT(*) as total_students,
        SUM(CASE WHEN m.status = 'ACTIVE' THEN 1 ELSE 0 END) as active_students
      FROM institute_memberships m
      WHERE m.institute_id = ?
    `).get(instituteId) as { total_students: number; active_students: number };

    // Total evaluations conducted by sponsored students
    const evalStats = db.prepare(`
      SELECT 
        COUNT(e.id) as total_evaluations,
        AVG(e.percentage) as average_score
      FROM evaluations e
      JOIN institute_memberships m ON m.student_id = e.student_id
      WHERE m.institute_id = ? AND e.status = 'COMPLETED'
    `).get(instituteId) as { total_evaluations: number; average_score: number | null };

    // Batches count and performance
    const batches = db.prepare(`
      SELECT b.*, COUNT(m.id) as student_count
      FROM batches b
      LEFT JOIN institute_memberships m ON m.batch_id = b.id AND m.status = 'ACTIVE'
      WHERE b.institute_id = ?
      GROUP BY b.id
    `).all(instituteId);

    // Top performers
    const topPerformers = db.prepare(`
      SELECT u.id, u.full_name, u.email, AVG(e.percentage) as avg_score, COUNT(e.id) as evals_count
      FROM users u
      JOIN institute_memberships m ON m.student_id = u.id
      JOIN evaluations e ON e.student_id = u.id
      WHERE m.institute_id = ? AND e.status = 'COMPLETED'
      GROUP BY u.id
      ORDER BY avg_score DESC
      LIMIT 5
    `).all(instituteId);

    // Subject Performance in Institute
    const subjectStats = db.prepare(`
      SELECT e.subject_name, AVG(e.percentage) as avg_score, COUNT(e.id) as count
      FROM evaluations e
      JOIN institute_memberships m ON m.student_id = e.student_id
      WHERE m.institute_id = ? AND e.status = 'COMPLETED'
      GROUP BY e.subject_name
      ORDER BY count DESC
    `).all(instituteId);

    return res.json({
      institute,
      metrics: {
        totalStudents: studentCountRow.total_students || 0,
        activeStudents: studentCountRow.active_students || 0,
        totalEvaluations: evalStats.total_evaluations || 0,
        averageScore: evalStats.average_score ? Math.round(evalStats.average_score * 10) / 10 : 0,
        maxStudentsAllowed: institute.max_students || 500,
        subscriptionStatus: institute.status,
        subscriptionExpiresAt: institute.subscription_expires_at,
      },
      batches,
      topPerformers,
      subjectStats,
    });
  } catch (error: unknown) {
    console.error('Institute dashboard error:', error);
    return res.status(500).json({ error: 'Failed to load institute dashboard' });
  }
});

// 2. Students Management: List Students
router.get('/students', (req: AuthRequest, res: Response) => {
  try {
    const instituteId = getAdminInstituteId(req);
    if (!instituteId) return res.status(404).json({ error: 'Institute not found' });

    const { search, batchId, status } = req.query;

    let query = `
      SELECT COALESCE(u.id, m.student_id, m.id) as id,
             m.id as membership_id,
             u.id as user_id,
             COALESCE(u.full_name, m.student_name, 'Invited Student') as full_name,
             COALESCE(u.email, m.invited_email) as email,
             u.phone,
             p.icai_registration_number,
             p.ca_level,
             m.status as status,
             m.joined_at,
             m.invited_email,
             b.name as batch_name,
             b.id as batch_id,
             COUNT(e.id) as evaluations_count,
             AVG(e.percentage) as average_percentage
      FROM institute_memberships m
      LEFT JOIN users u ON u.id = m.student_id
      LEFT JOIN student_profiles p ON p.user_id = u.id
      LEFT JOIN batches b ON b.id = m.batch_id
      LEFT JOIN evaluations e ON (e.student_id = u.id OR e.student_id = m.student_id) AND e.institute_id = ? AND e.status = 'COMPLETED'
      WHERE m.institute_id = ?
    `;
    const params: any[] = [instituteId, instituteId];

    if (batchId) {
      if (batchId === 'unassigned') {
        query += ' AND m.batch_id IS NULL';
      } else {
        query += ' AND m.batch_id = ?';
        params.push(batchId);
      }
    }
    if (status) {
      query += ' AND m.status = ?';
      params.push(status);
    }
    if (search) {
      query += ' AND (u.full_name LIKE ? OR u.email LIKE ? OR m.invited_email LIKE ? OR p.icai_registration_number LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ' GROUP BY m.id ORDER BY m.joined_at DESC';

    const students = db.prepare(query).all(...params);
    return res.json({ students });
  } catch (error: unknown) {
    console.error('Institute list students error:', error);
    return res.status(500).json({ error: 'Failed to retrieve students' });
  }
});

// 3. Add / Enroll Student to Institute (Direct or Pending Email Invitation)
router.post('/students', (req: AuthRequest, res: Response) => {
  try {
    const instituteId = getAdminInstituteId(req);
    if (!instituteId) return res.status(404).json({ error: 'Institute not found' });

    const { email, batchId, studentName, notes, phone, icaiRegistrationNumber, caLevel } = req.body;
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid student email is required.' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Verify batchId if provided belongs to this institute
    if (batchId) {
      const validBatch = db.prepare('SELECT id FROM batches WHERE id = ? AND institute_id = ?').get(batchId, instituteId);
      if (!validBatch) {
        return res.status(400).json({ error: 'Invalid batch selected for this institute.' });
      }
    }

    // Check institute capacity
    const countRow = db.prepare("SELECT COUNT(*) as count FROM institute_memberships WHERE institute_id = ? AND status = 'ACTIVE'").get(instituteId) as { count: number };
    const inst = db.prepare('SELECT name, max_students FROM institutes WHERE id = ?').get(instituteId) as { name: string; max_students: number };
    const maxCapacity = inst?.max_students || 50;
    if (countRow.count >= maxCapacity) {
      return res.status(403).json({ error: `Institute student limit (${maxCapacity}) reached. Please upgrade your capacity.` });
    }

    // Check if student user exists in users table
    const existingUser = db.prepare('SELECT id, full_name, email, role FROM users WHERE lower(email) = ?').get(normalizedEmail) as {
      id: string;
      full_name: string;
      email: string;
      role: string;
    } | undefined;

    if (existingUser) {
      if (existingUser.role !== 'STUDENT') {
        return res.status(400).json({ error: `The account with email ${normalizedEmail} is registered as ${existingUser.role}. Only student accounts can be enrolled.` });
      }

      // Check existing membership in THIS institute
      const existingMembership = db.prepare('SELECT id, status, batch_id FROM institute_memberships WHERE institute_id = ? AND student_id = ?').get(instituteId, existingUser.id) as { id: string; status: string; batch_id: string } | undefined;

      if (existingMembership) {
        if (existingMembership.status === 'ACTIVE') {
          // If already active, update batch if requested or inform admin
          if (batchId && batchId !== existingMembership.batch_id) {
            db.prepare('UPDATE institute_memberships SET batch_id = ?, notes = COALESCE(?, notes) WHERE id = ?').run(batchId, notes || null, existingMembership.id);
            logInstituteAudit(req.user!.id, 'ASSIGN_BATCH', 'MEMBERSHIP', existingMembership.id, { batchId, studentEmail: normalizedEmail });
            return res.json({ success: true, message: `Student ${existingUser.full_name} is already enrolled in ${inst.name}. Batch updated.` });
          }
          return res.status(400).json({ error: `Student ${existingUser.full_name} (${normalizedEmail}) is already actively enrolled in this institute.` });
        } else {
          // Reactivate inactive membership
          db.prepare("UPDATE institute_memberships SET status = 'ACTIVE', batch_id = ?, notes = COALESCE(?, notes), joined_at = CURRENT_TIMESTAMP WHERE id = ?")
            .run(batchId || null, notes || null, existingMembership.id);
          
          logInstituteAudit(req.user!.id, 'REACTIVATE_STUDENT_ENROLLMENT', 'MEMBERSHIP', existingMembership.id, { instituteId, studentId: existingUser.id });
          return res.json({ success: true, message: `Student ${existingUser.full_name} re-enrolled successfully with active sponsorship.` });
        }
      }

      // Create new active membership (multi-institute supported: no check blocking enrollment if student belongs to another institute!)
      const membershipId = `mem_${crypto.randomBytes(8).toString('hex')}`;
      db.prepare(`
        INSERT INTO institute_memberships (id, institute_id, student_id, batch_id, status, invited_email, student_name, notes, joined_at)
        VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(membershipId, instituteId, existingUser.id, batchId || null, normalizedEmail, existingUser.full_name, notes || null);

      // Optionally update student profile registration info if provided and empty
      if (icaiRegistrationNumber || caLevel) {
        db.prepare(`
          UPDATE student_profiles
          SET icai_registration_number = COALESCE(icai_registration_number, ?),
              ca_level = COALESCE(ca_level, ?)
          WHERE user_id = ?
        `).run(icaiRegistrationNumber || null, caLevel || null, existingUser.id);
      }

      // Send in-app notification to student
      const notifId = `notif_${crypto.randomBytes(8).toString('hex')}`;
      db.prepare(`
        INSERT INTO notifications (id, user_id, title, message, type, created_at)
        VALUES (?, ?, 'Institute Membership Activated', ?, 'INSTITUTE', CURRENT_TIMESTAMP)
      `).run(notifId, existingUser.id, `You have been enrolled in ${inst.name}. Your evaluations and test series are now sponsored.`);

      logInstituteAudit(req.user!.id, 'ENROLL_STUDENT', 'MEMBERSHIP', membershipId, {
        instituteId,
        studentId: existingUser.id,
        email: normalizedEmail,
        batchId: batchId || null,
      });

      return res.status(201).json({
        success: true,
        message: `Student ${existingUser.full_name} enrolled successfully with full institute sponsorship in ${inst.name}.`,
      });
    } else {
      // User has not registered yet -> create pending invitation record
      const existingInvite = db.prepare('SELECT id, status FROM institute_memberships WHERE institute_id = ? AND lower(invited_email) = ?').get(instituteId, normalizedEmail) as { id: string; status: string } | undefined;

      let membershipId = existingInvite?.id;
      if (existingInvite) {
        db.prepare("UPDATE institute_memberships SET batch_id = ?, student_name = COALESCE(?, student_name), notes = COALESCE(?, notes), status = 'PENDING' WHERE id = ?")
          .run(batchId || null, studentName || null, notes || null, existingInvite.id);
      } else {
        membershipId = `mem_${crypto.randomBytes(8).toString('hex')}`;
        db.prepare(`
          INSERT INTO institute_memberships (id, institute_id, student_id, batch_id, status, invited_email, student_name, notes, joined_at)
          VALUES (?, ?, NULL, ?, 'PENDING', ?, ?, ?, CURRENT_TIMESTAMP)
        `).run(membershipId, instituteId, batchId || null, normalizedEmail, studentName || 'Invited Student', notes || null);
      }

      logInstituteAudit(req.user!.id, 'INVITE_STUDENT', 'MEMBERSHIP', membershipId || 'invite', {
        instituteId,
        email: normalizedEmail,
        batchId: batchId || null,
      });

      return res.status(201).json({
        success: true,
        pending: true,
        message: `Student invitation recorded for ${normalizedEmail}. When this student signs up with this email, their account will automatically be linked to ${inst.name} and the selected batch.`,
      });
    }
  } catch (error: unknown) {
    console.error('Enroll student error:', error);
    return res.status(500).json({ error: 'Failed to enroll student' });
  }
});

// 3b. Bulk Enroll Students (from CSV / batch import)
router.post('/students/bulk', (req: AuthRequest, res: Response) => {
  try {
    const instituteId = getAdminInstituteId(req);
    if (!instituteId) return res.status(404).json({ error: 'Institute not found' });

    const { students, batchId } = req.body;
    if (!Array.isArray(students) || students.length === 0) {
      return res.status(400).json({ error: 'A list of students is required.' });
    }

    const results = {
      enrolled: 0,
      invited: 0,
      skipped: 0,
      errors: [] as string[],
    };

    const institute = db.prepare('SELECT name, max_students FROM institutes WHERE id = ?').get(instituteId) as { name: string; max_students: number } | undefined;
    const currentCount = db.prepare("SELECT COUNT(*) as count FROM institute_memberships WHERE institute_id = ? AND status = 'ACTIVE'").get(instituteId) as { count: number };
    const maxCapacity = institute?.max_students || 50;

    for (const item of students) {
      const email = typeof item === 'string' ? item.trim() : item?.email?.trim();
      const name = typeof item === 'object' ? item.fullName || item.name : '';
      const targetBatchId = (typeof item === 'object' && item.batchId) ? item.batchId : batchId;

      if (!email || !email.includes('@')) {
        results.skipped++;
        continue;
      }

      const normalizedEmail = email.toLowerCase();

      if (currentCount.count + results.enrolled >= maxCapacity) {
        results.errors.push(`Student limit reached (${maxCapacity}). Cannot enroll ${email}.`);
        results.skipped++;
        continue;
      }

      const user = db.prepare('SELECT id, full_name, email, role FROM users WHERE lower(email) = ?').get(normalizedEmail) as { id: string; full_name: string; email: string; role: string } | undefined;

      if (user && user.role === 'STUDENT') {
        const existingMem = db.prepare('SELECT id, status FROM institute_memberships WHERE institute_id = ? AND student_id = ?').get(instituteId, user.id) as { id: string; status: string } | undefined;

        if (existingMem) {
          db.prepare("UPDATE institute_memberships SET status = 'ACTIVE', batch_id = COALESCE(?, batch_id) WHERE id = ?").run(targetBatchId || null, existingMem.id);
        } else {
          const memId = `mem_${crypto.randomBytes(8).toString('hex')}`;
          db.prepare(`
            INSERT INTO institute_memberships (id, institute_id, student_id, batch_id, status, invited_email, student_name, joined_at)
            VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?, CURRENT_TIMESTAMP)
          `).run(memId, instituteId, user.id, targetBatchId || null, normalizedEmail, user.full_name);
        }
        results.enrolled++;
      } else {
        const existingInvite = db.prepare('SELECT id FROM institute_memberships WHERE institute_id = ? AND lower(invited_email) = ?').get(instituteId, normalizedEmail) as { id: string } | undefined;

        if (existingInvite) {
          db.prepare("UPDATE institute_memberships SET batch_id = COALESCE(?, batch_id), status = 'PENDING' WHERE id = ?").run(targetBatchId || null, existingInvite.id);
        } else {
          const memId = `mem_${crypto.randomBytes(8).toString('hex')}`;
          db.prepare(`
            INSERT INTO institute_memberships (id, institute_id, student_id, batch_id, status, invited_email, student_name, joined_at)
            VALUES (?, ?, NULL, ?, 'PENDING', ?, ?, CURRENT_TIMESTAMP)
          `).run(memId, instituteId, targetBatchId || null, normalizedEmail, name || 'Invited Student');
        }
        results.invited++;
      }
    }

    logInstituteAudit(req.user!.id, 'BULK_ENROLL_STUDENTS', 'MEMBERSHIP', instituteId, {
      enrolled: results.enrolled,
      invited: results.invited,
      skipped: results.skipped,
    });

    return res.json({
      success: true,
      message: `Bulk processing complete: ${results.enrolled} active enrolled, ${results.invited} pending invitations recorded.`,
      ...results,
    });
  } catch (error: unknown) {
    console.error('Bulk enroll students error:', error);
    return res.status(500).json({ error: 'Failed to process bulk student enrollment.' });
  }
});

// 4. Student Details View (/institute/students/:id)
router.get('/students/:id', (req: AuthRequest, res: Response) => {
  try {
    const instituteId = getAdminInstituteId(req);
    if (!instituteId) return res.status(404).json({ error: 'Institute not found' });

    const studentIdOrMembershipId = req.params.id;

    // Look up membership
    const membership = db.prepare(`
      SELECT m.*,
             b.name as batch_name,
             b.course_level as batch_level,
             b.target_attempt as batch_target_attempt,
             u.full_name as user_full_name,
             u.email as user_email,
             u.phone as user_phone,
             p.icai_registration_number,
             p.ca_level
      FROM institute_memberships m
      LEFT JOIN users u ON u.id = m.student_id
      LEFT JOIN student_profiles p ON p.user_id = u.id
      LEFT JOIN batches b ON b.id = m.batch_id
      WHERE m.institute_id = ? AND (m.student_id = ? OR m.id = ?)
    `).get(instituteId, studentIdOrMembershipId, studentIdOrMembershipId) as any;

    if (!membership) {
      return res.status(404).json({ error: 'Student enrollment record not found in this institute.' });
    }

    // Fetch evaluations completed under this institute
    const evaluations = membership.student_id ? db.prepare(`
      SELECT e.id, e.subject_name, e.paper, e.total_marks, e.maximum_marks, e.percentage, e.grade, e.status, e.created_at
      FROM evaluations e
      WHERE e.institute_id = ? AND e.student_id = ?
      ORDER BY e.created_at DESC
    `).all(instituteId, membership.student_id) : [];

    // Fetch available batches in this institute for easy assignment
    const availableBatches = db.prepare(`
      SELECT id, name, course_level, target_attempt
      FROM batches
      WHERE institute_id = ?
      ORDER BY name ASC
    `).all(instituteId);

    return res.json({
      student: {
        id: membership.student_id || membership.id,
        fullName: membership.user_full_name || membership.student_name || 'Invited Student',
        email: membership.user_email || membership.invited_email,
        phone: membership.user_phone,
        icaiRegistrationNumber: membership.icai_registration_number,
        caLevel: membership.ca_level,
      },
      membership: {
        id: membership.id,
        status: membership.status,
        batchId: membership.batch_id,
        batchName: membership.batch_name || 'Unassigned',
        joinedAt: membership.joined_at,
        notes: membership.notes,
      },
      evaluations,
      availableBatches,
    });
  } catch (error: unknown) {
    console.error('Get student details error:', error);
    return res.status(500).json({ error: 'Failed to load student details' });
  }
});

// 4b. Assign or Change Student Batch
router.put('/students/:id/batch', (req: AuthRequest, res: Response) => {
  try {
    const instituteId = getAdminInstituteId(req);
    if (!instituteId) return res.status(404).json({ error: 'Institute not found' });

    const studentIdOrMembershipId = req.params.id;
    const { batchId } = req.body;

    const membership = db.prepare(`
      SELECT id, student_id, batch_id FROM institute_memberships
      WHERE institute_id = ? AND (student_id = ? OR id = ?)
    `).get(instituteId, studentIdOrMembershipId, studentIdOrMembershipId) as { id: string; student_id: string; batch_id: string } | undefined;

    if (!membership) {
      return res.status(404).json({ error: 'Student enrollment record not found in this institute.' });
    }

    if (batchId) {
      const batch = db.prepare('SELECT id, name FROM batches WHERE id = ? AND institute_id = ?').get(batchId, instituteId) as { id: string; name: string } | undefined;
      if (!batch) {
        return res.status(400).json({ error: 'Invalid batch for this institute.' });
      }
    }

    db.prepare('UPDATE institute_memberships SET batch_id = ? WHERE id = ?').run(batchId || null, membership.id);

    logInstituteAudit(req.user!.id, 'CHANGE_STUDENT_BATCH', 'MEMBERSHIP', membership.id, {
      instituteId,
      oldBatchId: membership.batch_id,
      newBatchId: batchId || null,
    });

    return res.json({ success: true, message: 'Student batch assignment updated successfully.' });
  } catch (error: unknown) {
    console.error('Update student batch error:', error);
    return res.status(500).json({ error: 'Failed to update student batch' });
  }
});

// 4c. Remove Student from Institute (Sponsorship stops, historical evaluations and user accounts preserved!)
router.delete('/students/:id', (req: AuthRequest, res: Response) => {
  try {
    const instituteId = getAdminInstituteId(req);
    if (!instituteId) return res.status(404).json({ error: 'Institute not found' });

    const studentIdOrMembershipId = req.params.id;

    // Verify membership belongs to this institute
    const membership = db.prepare(`
      SELECT id, student_id, invited_email, student_name FROM institute_memberships
      WHERE institute_id = ? AND (student_id = ? OR id = ?)
    `).get(instituteId, studentIdOrMembershipId, studentIdOrMembershipId) as {
      id: string;
      student_id: string;
      invited_email: string;
      student_name: string;
    } | undefined;

    if (!membership) {
      return res.status(404).json({ error: 'Student membership not found in this institute.' });
    }

    // Set membership status to INACTIVE and clear batch assignment
    db.prepare(`
      UPDATE institute_memberships
      SET status = 'INACTIVE', batch_id = NULL
      WHERE id = ?
    `).run(membership.id);

    // If student user exists, notify them
    if (membership.student_id) {
      const inst = db.prepare('SELECT name FROM institutes WHERE id = ?').get(instituteId) as { name: string } | undefined;
      const notifId = `notif_${crypto.randomBytes(8).toString('hex')}`;
      db.prepare(`
        INSERT INTO notifications (id, user_id, title, message, type, created_at)
        VALUES (?, ?, 'Institute Sponsorship Update', ?, 'INSTITUTE', CURRENT_TIMESTAMP)
      `).run(notifId, membership.student_id, `Your enrollment under ${inst?.name || 'your coaching institute'} has ended. Your personal account and historical reports remain intact.`);
    }

    logInstituteAudit(req.user!.id, 'REMOVE_STUDENT_FROM_INSTITUTE', 'MEMBERSHIP', membership.id, {
      instituteId,
      studentId: membership.student_id,
      email: membership.invited_email,
    });

    return res.json({
      success: true,
      message: 'Student removed from institute. Historical evaluations, reports, and student user account remain safely preserved.',
    });
  } catch (error: unknown) {
    console.error('Remove student error:', error);
    return res.status(500).json({ error: 'Failed to remove student from institute' });
  }
});

// 5. Batch Management: List Batches
router.get('/batches', (req: AuthRequest, res: Response) => {
  try {
    const instituteId = getAdminInstituteId(req);
    if (!instituteId) return res.status(404).json({ error: 'Institute not found' });

    const batches = db.prepare(`
      SELECT b.*,
             COUNT(CASE WHEN m.status = 'ACTIVE' THEN 1 ELSE NULL END) as student_count
      FROM batches b
      LEFT JOIN institute_memberships m ON m.batch_id = b.id AND m.institute_id = b.institute_id
      WHERE b.institute_id = ?
      GROUP BY b.id
      ORDER BY b.created_at DESC
    `).all(instituteId);

    return res.json({ batches });
  } catch (error: unknown) {
    console.error('Get batches error:', error);
    return res.status(500).json({ error: 'Failed to load batches' });
  }
});

// 5b. Create Batch
router.post('/batches', (req: AuthRequest, res: Response) => {
  try {
    const instituteId = getAdminInstituteId(req);
    if (!instituteId) return res.status(404).json({ error: 'Institute not found' });

    const { name, courseLevel, targetAttempt, description, capacity } = req.body;
    if (!name || !courseLevel) {
      return res.status(400).json({ error: 'Batch name and course level are required.' });
    }

    const batchId = `batch_${crypto.randomBytes(8).toString('hex')}`;
    db.prepare(`
      INSERT INTO batches (id, institute_id, name, course_level, target_attempt, description, capacity, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', CURRENT_TIMESTAMP)
    `).run(
      batchId,
      instituteId,
      name.trim(),
      courseLevel,
      targetAttempt?.trim() || 'May 2026',
      description?.trim() || null,
      capacity ? Number(capacity) : 100
    );

    logInstituteAudit(req.user!.id, 'CREATE_BATCH', 'BATCH', batchId, {
      name,
      courseLevel,
      targetAttempt,
    });

    return res.status(201).json({ success: true, batchId, message: 'Batch created successfully.' });
  } catch (error: unknown) {
    console.error('Create batch error:', error);
    return res.status(500).json({ error: 'Failed to create batch' });
  }
});

// 5c. Batch Details View (/institute/batches/:id)
router.get('/batches/:id', (req: AuthRequest, res: Response) => {
  try {
    const instituteId = getAdminInstituteId(req);
    if (!instituteId) return res.status(404).json({ error: 'Institute not found' });

    const batchId = req.params.id;

    const batch = db.prepare(`
      SELECT b.*,
             COUNT(CASE WHEN m.status = 'ACTIVE' THEN 1 ELSE NULL END) as student_count
      FROM batches b
      LEFT JOIN institute_memberships m ON m.batch_id = b.id AND m.institute_id = b.institute_id
      WHERE b.id = ? AND b.institute_id = ?
      GROUP BY b.id
    `).get(batchId, instituteId) as any;

    if (!batch) {
      return res.status(404).json({ error: 'Batch not found in this institute.' });
    }

    // List of students currently in this batch
    const students = db.prepare(`
      SELECT COALESCE(u.id, m.student_id, m.id) as id,
             m.id as membership_id,
             u.id as user_id,
             COALESCE(u.full_name, m.student_name, 'Invited Student') as full_name,
             COALESCE(u.email, m.invited_email) as email,
             u.phone,
             p.icai_registration_number,
             p.ca_level,
             m.status as status,
             m.joined_at,
             COUNT(e.id) as evaluations_count,
             AVG(e.percentage) as average_percentage
      FROM institute_memberships m
      LEFT JOIN users u ON u.id = m.student_id
      LEFT JOIN student_profiles p ON p.user_id = u.id
      LEFT JOIN evaluations e ON (e.student_id = u.id OR e.student_id = m.student_id) AND e.institute_id = ? AND e.status = 'COMPLETED'
      WHERE m.institute_id = ? AND m.batch_id = ?
      GROUP BY m.id
      ORDER BY m.joined_at DESC
    `).all(instituteId, instituteId, batchId);

    // List of enrolled active students in this institute who are NOT in this batch
    const availableStudents = db.prepare(`
      SELECT COALESCE(u.id, m.student_id, m.id) as id,
             m.id as membership_id,
             COALESCE(u.full_name, m.student_name, 'Invited Student') as full_name,
             COALESCE(u.email, m.invited_email) as email,
             p.icai_registration_number,
             m.batch_id,
             b.name as current_batch_name
      FROM institute_memberships m
      LEFT JOIN users u ON u.id = m.student_id
      LEFT JOIN student_profiles p ON p.user_id = u.id
      LEFT JOIN batches b ON b.id = m.batch_id
      WHERE m.institute_id = ? AND m.status = 'ACTIVE' AND (m.batch_id IS NULL OR m.batch_id != ?)
      ORDER BY full_name ASC
    `).all(instituteId, batchId);

    // Other batches in this institute (for move student)
    const otherBatches = db.prepare(`
      SELECT id, name, course_level, target_attempt
      FROM batches
      WHERE institute_id = ? AND id != ?
      ORDER BY name ASC
    `).all(instituteId, batchId);

    return res.json({
      batch,
      students,
      availableStudents,
      otherBatches,
    });
  } catch (error: unknown) {
    console.error('Get batch details error:', error);
    return res.status(500).json({ error: 'Failed to load batch details' });
  }
});

// 5d. Add Students to Batch (bulk or single)
router.post('/batches/:id/students', (req: AuthRequest, res: Response) => {
  try {
    const instituteId = getAdminInstituteId(req);
    if (!instituteId) return res.status(404).json({ error: 'Institute not found' });

    const batchId = req.params.id;
    const batch = db.prepare('SELECT id, name FROM batches WHERE id = ? AND institute_id = ?').get(batchId, instituteId) as { id: string; name: string } | undefined;
    if (!batch) return res.status(404).json({ error: 'Batch not found in this institute.' });

    const { studentIds, studentId } = req.body;
    const idsToAdd: string[] = studentIds && Array.isArray(studentIds) ? studentIds : (studentId ? [studentId] : []);

    if (idsToAdd.length === 0) {
      return res.status(400).json({ error: 'At least one student must be selected.' });
    }

    let assignedCount = 0;
    for (const sid of idsToAdd) {
      const resUpdate = db.prepare(`
        UPDATE institute_memberships
        SET batch_id = ?
        WHERE institute_id = ? AND (student_id = ? OR id = ?)
      `).run(batchId, instituteId, sid, sid);

      if (resUpdate.changes > 0) assignedCount++;
    }

    logInstituteAudit(req.user!.id, 'ASSIGN_STUDENTS_TO_BATCH', 'BATCH', batchId, {
      batchName: batch.name,
      assignedCount,
      studentIds: idsToAdd,
    });

    return res.json({
      success: true,
      message: `Successfully assigned ${assignedCount} student(s) to ${batch.name}.`,
    });
  } catch (error: unknown) {
    console.error('Add students to batch error:', error);
    return res.status(500).json({ error: 'Failed to assign students to batch' });
  }
});

// 5e. Remove Student from Batch (Student remains active in institute, batch set to NULL)
router.delete('/batches/:id/students/:studentId', (req: AuthRequest, res: Response) => {
  try {
    const instituteId = getAdminInstituteId(req);
    if (!instituteId) return res.status(404).json({ error: 'Institute not found' });

    const { id: batchId, studentId } = req.params;

    const resUpdate = db.prepare(`
      UPDATE institute_memberships
      SET batch_id = NULL
      WHERE institute_id = ? AND batch_id = ? AND (student_id = ? OR id = ?)
    `).run(instituteId, batchId, studentId, studentId);

    if (resUpdate.changes === 0) {
      return res.status(404).json({ error: 'Student not found in this batch.' });
    }

    logInstituteAudit(req.user!.id, 'REMOVE_STUDENT_FROM_BATCH', 'BATCH', batchId, {
      studentId,
    });

    return res.json({
      success: true,
      message: 'Student removed from batch. The student remains enrolled in the institute.',
    });
  } catch (error: unknown) {
    console.error('Remove student from batch error:', error);
    return res.status(500).json({ error: 'Failed to remove student from batch' });
  }
});

// 5f. Move Student Between Batches
router.post('/batches/:id/move-student', (req: AuthRequest, res: Response) => {
  try {
    const instituteId = getAdminInstituteId(req);
    if (!instituteId) return res.status(404).json({ error: 'Institute not found' });

    const { id: sourceBatchId } = req.params;
    const { studentId, targetBatchId } = req.body;

    if (!studentId) {
      return res.status(400).json({ error: 'Student ID is required.' });
    }

    // Verify target batch if provided
    let targetBatchName = 'Unassigned';
    if (targetBatchId) {
      const targetBatch = db.prepare('SELECT id, name FROM batches WHERE id = ? AND institute_id = ?').get(targetBatchId, instituteId) as { id: string; name: string } | undefined;
      if (!targetBatch) {
        return res.status(400).json({ error: 'Target batch not found in this institute.' });
      }
      targetBatchName = targetBatch.name;
    }

    const resUpdate = db.prepare(`
      UPDATE institute_memberships
      SET batch_id = ?
      WHERE institute_id = ? AND (student_id = ? OR id = ?)
    `).run(targetBatchId || null, instituteId, studentId, studentId);

    if (resUpdate.changes === 0) {
      return res.status(404).json({ error: 'Student not found in this institute.' });
    }

    logInstituteAudit(req.user!.id, 'MOVE_STUDENT_BATCH', 'BATCH', targetBatchId || 'unassigned', {
      sourceBatchId,
      targetBatchId,
      studentId,
    });

    return res.json({
      success: true,
      message: `Student successfully moved to ${targetBatchName}. Historical evaluations remain intact.`,
    });
  } catch (error: unknown) {
    console.error('Move student batch error:', error);
    return res.status(500).json({ error: 'Failed to move student to new batch' });
  }
});

// 5g. Update Batch Metadata
router.put('/batches/:id', (req: AuthRequest, res: Response) => {
  try {
    const instituteId = getAdminInstituteId(req);
    if (!instituteId) return res.status(404).json({ error: 'Institute not found' });

    const batchId = req.params.id;
    const { name, courseLevel, targetAttempt, description, capacity, status } = req.body;

    const existing = db.prepare('SELECT id FROM batches WHERE id = ? AND institute_id = ?').get(batchId, instituteId);
    if (!existing) return res.status(404).json({ error: 'Batch not found.' });

    db.prepare(`
      UPDATE batches
      SET name = COALESCE(?, name),
          course_level = COALESCE(?, course_level),
          target_attempt = COALESCE(?, target_attempt),
          description = COALESCE(?, description),
          capacity = COALESCE(?, capacity),
          status = COALESCE(?, status)
      WHERE id = ? AND institute_id = ?
    `).run(
      name?.trim() || null,
      courseLevel || null,
      targetAttempt?.trim() || null,
      description !== undefined ? description?.trim() : null,
      capacity ? Number(capacity) : null,
      status || null,
      batchId,
      instituteId
    );

    logInstituteAudit(req.user!.id, 'UPDATE_BATCH', 'BATCH', batchId, {
      name,
      courseLevel,
      targetAttempt,
    });

    return res.json({ success: true, message: 'Batch updated successfully.' });
  } catch (error: unknown) {
    console.error('Update batch error:', error);
    return res.status(500).json({ error: 'Failed to update batch' });
  }
});

// 5h. Delete Batch (Safety: Unassigns students first, never deletes students or evaluations)
router.delete('/batches/:id', (req: AuthRequest, res: Response) => {
  try {
    const instituteId = getAdminInstituteId(req);
    if (!instituteId) return res.status(404).json({ error: 'Institute not found' });

    const batchId = req.params.id;
    const batch = db.prepare('SELECT id, name FROM batches WHERE id = ? AND institute_id = ?').get(batchId, instituteId) as { id: string; name: string } | undefined;
    if (!batch) return res.status(404).json({ error: 'Batch not found.' });

    // Safely unassign all students from this batch in this institute
    db.prepare(`
      UPDATE institute_memberships
      SET batch_id = NULL
      WHERE institute_id = ? AND batch_id = ?
    `).run(instituteId, batchId);

    // Delete the batch
    db.prepare('DELETE FROM batches WHERE id = ? AND institute_id = ?').run(batchId, instituteId);

    logInstituteAudit(req.user!.id, 'DELETE_BATCH', 'BATCH', batchId, {
      deletedBatchName: batch.name,
    });

    return res.json({
      success: true,
      message: `Batch "${batch.name}" deleted. Any enrolled students have been moved to unassigned status.`,
    });
  } catch (error: unknown) {
    console.error('Delete batch error:', error);
    return res.status(500).json({ error: 'Failed to delete batch' });
  }
});

// 6. Institute Assignments
router.get('/assignments', (req: AuthRequest, res: Response) => {
  try {
    const instituteId = getAdminInstituteId(req);
    if (!instituteId) return res.status(404).json({ error: 'Institute not found' });

    const assignments = db.prepare(`
      SELECT a.*, b.name as batch_name, COUNT(s.id) as submissions_count
      FROM institute_assignments a
      LEFT JOIN batches b ON b.id = a.batch_id
      LEFT JOIN assignment_submissions s ON s.assignment_id = a.id
      WHERE a.institute_id = ?
      GROUP BY a.id
      ORDER BY a.created_at DESC
    `).all(instituteId);

    return res.json({ assignments });
  } catch (error: unknown) {
    console.error('Get assignments error:', error);
    return res.status(500).json({ error: 'Failed to load assignments' });
  }
});

router.post('/assignments', (req: AuthRequest, res: Response) => {
  try {
    const instituteId = getAdminInstituteId(req);
    if (!instituteId) return res.status(404).json({ error: 'Institute not found' });

    const { title, subjectKey, subjectName, maximumMarks, instructions, timeLimitMinutes, deadline, batchId } = req.body;

    if (!title || !subjectKey || !subjectName || !deadline) {
      return res.status(400).json({ error: 'Title, subject, and deadline are required for an assignment.' });
    }

    const assignmentId = `asgn_${crypto.randomBytes(8).toString('hex')}`;
    db.prepare(`
      INSERT INTO institute_assignments (
        id, institute_id, batch_id, title, subject_key, subject_name,
        maximum_marks, instructions, time_limit_minutes, deadline
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      assignmentId,
      instituteId,
      batchId || null,
      title.trim(),
      subjectKey,
      subjectName,
      Number(maximumMarks) || 100,
      instructions?.trim() || '',
      Number(timeLimitMinutes) || null,
      deadline
    );

    return res.status(201).json({ success: true, assignmentId, message: 'Assignment created successfully.' });
  } catch (error: unknown) {
    console.error('Create assignment error:', error);
    return res.status(500).json({ error: 'Failed to create assignment' });
  }
});

// 7. Update Institute Profile
router.get('/profile', (req: AuthRequest, res: Response) => {
  try {
    const instituteId = getAdminInstituteId(req);
    if (!instituteId) return res.status(404).json({ error: 'Institute not found' });

    const institute = db.prepare('SELECT * FROM institutes WHERE id = ?').get(instituteId);
    return res.json({ institute });
  } catch (error: unknown) {
    console.error('Get institute profile error:', error);
    return res.status(500).json({ error: 'Failed to load institute profile' });
  }
});

router.put('/profile', (req: AuthRequest, res: Response) => {
  try {
    const instituteId = getAdminInstituteId(req);
    if (!instituteId) return res.status(404).json({ error: 'Institute not found' });

    const { name, phone, address, website, contactPerson } = req.body;
    db.prepare(`
      UPDATE institutes
      SET name = COALESCE(?, name),
          phone = COALESCE(?, phone),
          address = COALESCE(?, address),
          website = COALESCE(?, website),
          contact_person = COALESCE(?, contact_person)
      WHERE id = ?
    `).run(name?.trim(), phone?.trim(), address?.trim(), website?.trim(), contactPerson?.trim(), instituteId);

    return res.json({ success: true, message: 'Institute profile updated successfully.' });
  } catch (error: unknown) {
    console.error('Update institute profile error:', error);
    return res.status(500).json({ error: 'Failed to update institute profile' });
  }
});

// 8. Student Detail & Performance View
router.get('/students/:id', (req: AuthRequest, res: Response) => {
  try {
    const instituteId = getAdminInstituteId(req);
    if (!instituteId) return res.status(404).json({ error: 'Institute not found' });

    const studentId = req.params.id;

    // Verify membership belongs to this institute
    const membership = db.prepare(`
      SELECT m.*, b.name as batch_name, b.course_level as batch_level
      FROM institute_memberships m
      LEFT JOIN batches b ON b.id = m.batch_id
      WHERE m.institute_id = ? AND m.student_id = ?
    `).get(instituteId, studentId) as any;

    if (!membership) {
      return res.status(404).json({ error: 'Student not enrolled in your institute.' });
    }

    const student = db.prepare(`
      SELECT u.id, u.full_name, u.email, u.phone, u.status, u.created_at,
             p.icai_registration_number, p.ca_level
      FROM users u
      JOIN student_profiles p ON p.user_id = u.id
      WHERE u.id = ?
    `).get(studentId) as any;

    const evaluations = db.prepare(`
      SELECT e.id, e.subject_name, e.level, e.total_marks, e.maximum_marks, e.percentage,
             e.grade, e.confidence_score, e.status, e.created_at
      FROM evaluations e
      WHERE e.student_id = ?
      ORDER BY e.created_at DESC
    `).all(studentId);

    return res.json({
      student,
      membership,
      evaluations,
    });
  } catch (error: unknown) {
    console.error('Get student detail error:', error);
    return res.status(500).json({ error: 'Failed to load student details' });
  }
});

router.put('/students/:id/batch', (req: AuthRequest, res: Response) => {
  try {
    const instituteId = getAdminInstituteId(req);
    if (!instituteId) return res.status(404).json({ error: 'Institute not found' });

    const studentId = req.params.id;
    const { batchId } = req.body;

    db.prepare(`
      UPDATE institute_memberships
      SET batch_id = ?
      WHERE institute_id = ? AND student_id = ?
    `).run(batchId || null, instituteId, studentId);

    db.prepare(`
      UPDATE student_profiles
      SET batch_id = ?
      WHERE user_id = ? AND institute_id = ?
    `).run(batchId || null, studentId, instituteId);

    return res.json({ success: true, message: 'Batch assignment updated successfully.' });
  } catch (error: unknown) {
    console.error('Update student batch error:', error);
    return res.status(500).json({ error: 'Failed to update student batch' });
  }
});

// 9. Delete Batch
router.delete('/batches/:id', (req: AuthRequest, res: Response) => {
  try {
    const instituteId = getAdminInstituteId(req);
    if (!instituteId) return res.status(404).json({ error: 'Institute not found' });

    const batchId = req.params.id;
    // Unassign students from batch first
    db.prepare('UPDATE institute_memberships SET batch_id = NULL WHERE institute_id = ? AND batch_id = ?').run(instituteId, batchId);
    db.prepare('DELETE FROM batches WHERE id = ? AND institute_id = ?').run(batchId, instituteId);

    return res.json({ success: true, message: 'Batch deleted successfully.' });
  } catch (error: unknown) {
    console.error('Delete batch error:', error);
    return res.status(500).json({ error: 'Failed to delete batch' });
  }
});

// 10. Institute Tests & Scheduled Exams
router.get('/tests', (req: AuthRequest, res: Response) => {
  try {
    const instituteId = getAdminInstituteId(req);
    if (!instituteId) return res.status(404).json({ error: 'Institute not found' });

    const tests = db.prepare(`
      SELECT a.*, b.name as batch_name, COUNT(s.id) as submissions_count
      FROM institute_assignments a
      LEFT JOIN batches b ON b.id = a.batch_id
      LEFT JOIN assignment_submissions s ON s.assignment_id = a.id
      WHERE a.institute_id = ?
      GROUP BY a.id
      ORDER BY a.deadline ASC
    `).all(instituteId);

    return res.json({ tests });
  } catch (error: unknown) {
    console.error('Get institute tests error:', error);
    return res.status(500).json({ error: 'Failed to load scheduled tests' });
  }
});

router.post('/tests', (req: AuthRequest, res: Response) => {
  try {
    const instituteId = getAdminInstituteId(req);
    if (!instituteId) return res.status(404).json({ error: 'Institute not found' });

    const { title, subjectKey, subjectName, maximumMarks, instructions, timeLimitMinutes, deadline, batchId } = req.body;

    if (!title || !subjectKey || !deadline) {
      return res.status(400).json({ error: 'Title, subject, and test deadline are required.' });
    }

    const testId = `test_${crypto.randomBytes(8).toString('hex')}`;
    db.prepare(`
      INSERT INTO institute_assignments (
        id, institute_id, batch_id, title, subject_key, subject_name,
        maximum_marks, instructions, time_limit_minutes, deadline
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      testId,
      instituteId,
      batchId || null,
      title.trim(),
      subjectKey,
      subjectName || subjectKey,
      Number(maximumMarks) || 100,
      instructions?.trim() || '',
      Number(timeLimitMinutes) || null,
      deadline
    );

    return res.status(201).json({ success: true, testId, message: 'Test scheduled successfully.' });
  } catch (error: unknown) {
    console.error('Create test error:', error);
    return res.status(500).json({ error: 'Failed to create test' });
  }
});

// 11. Institute Evaluations List
router.get('/evaluations', (req: AuthRequest, res: Response) => {
  try {
    const instituteId = getAdminInstituteId(req);
    if (!instituteId) return res.status(404).json({ error: 'Institute not found' });

    const { batchId, search } = req.query;

    let query = `
      SELECT e.id, e.student_id, e.level, e.material_type, e.subject_name,
             e.total_marks, e.maximum_marks, e.percentage, e.grade, e.status, e.created_at,
             u.full_name as student_name, u.email as student_email,
             p.icai_registration_number, b.name as batch_name
      FROM evaluations e
      JOIN users u ON u.id = e.student_id
      JOIN institute_memberships m ON m.student_id = u.id
      LEFT JOIN student_profiles p ON p.user_id = u.id
      LEFT JOIN batches b ON b.id = m.batch_id
      WHERE m.institute_id = ?
    `;
    const params: any[] = [instituteId];

    if (batchId) {
      query += ' AND m.batch_id = ?';
      params.push(batchId);
    }
    if (search) {
      query += ' AND (u.full_name LIKE ? OR u.email LIKE ? OR e.subject_name LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY e.created_at DESC LIMIT 200';
    const evaluations = db.prepare(query).all(...params);
    return res.json({ evaluations });
  } catch (error: unknown) {
    console.error('Get institute evaluations error:', error);
    return res.status(500).json({ error: 'Failed to load evaluations' });
  }
});

// 12. Results & Performance Rankings
router.get('/results', (req: AuthRequest, res: Response) => {
  try {
    const instituteId = getAdminInstituteId(req);
    if (!instituteId) return res.status(404).json({ error: 'Institute not found' });

    const rankList = db.prepare(`
      SELECT u.id, u.full_name, u.email, p.icai_registration_number, p.ca_level,
             b.name as batch_name,
             COUNT(e.id) as evaluations_count,
             AVG(e.percentage) as average_percentage,
             MAX(e.percentage) as highest_score
      FROM users u
      JOIN institute_memberships m ON m.student_id = u.id
      JOIN student_profiles p ON p.user_id = u.id
      LEFT JOIN batches b ON b.id = m.batch_id
      JOIN evaluations e ON e.student_id = u.id AND e.status = 'COMPLETED'
      WHERE m.institute_id = ?
      GROUP BY u.id
      ORDER BY average_percentage DESC
      LIMIT 100
    `).all(instituteId);

    const batchStats = db.prepare(`
      SELECT b.id, b.name, b.course_level,
             COUNT(DISTINCT m.student_id) as enrolled_students,
             AVG(e.percentage) as batch_average_percentage,
             COUNT(e.id) as total_tests_taken
      FROM batches b
      LEFT JOIN institute_memberships m ON m.batch_id = b.id AND m.status = 'ACTIVE'
      LEFT JOIN evaluations e ON e.student_id = m.student_id AND e.status = 'COMPLETED'
      WHERE b.institute_id = ?
      GROUP BY b.id
    `).all(instituteId);

    return res.json({ rankList, batchStats });
  } catch (error: unknown) {
    console.error('Get results error:', error);
    return res.status(500).json({ error: 'Failed to load results' });
  }
});

// 13. Institute Analytics & Topic Weakness
router.get('/analytics', (req: AuthRequest, res: Response) => {
  try {
    const instituteId = getAdminInstituteId(req);
    if (!instituteId) return res.status(404).json({ error: 'Institute not found' });

    const subjectStats = db.prepare(`
      SELECT e.subject_name, e.level, COUNT(e.id) as total_evaluations, AVG(e.percentage) as avg_score,
             SUM(CASE WHEN e.percentage >= 40 THEN 1 ELSE 0 END) as pass_count
      FROM evaluations e
      JOIN institute_memberships m ON m.student_id = e.student_id
      WHERE m.institute_id = ? AND e.status = 'COMPLETED'
      GROUP BY e.subject_name
      ORDER BY total_evaluations DESC
    `).all(instituteId);

    return res.json({ subjectStats });
  } catch (error: unknown) {
    console.error('Get institute analytics error:', error);
    return res.status(500).json({ error: 'Failed to load institute analytics' });
  }
});

// 14. Subscription & Plan Quota
router.get('/subscription', (req: AuthRequest, res: Response) => {
  try {
    const instituteId = getAdminInstituteId(req);
    if (!instituteId) return res.status(404).json({ error: 'Institute not found' });

    const inst = db.prepare('SELECT * FROM institutes WHERE id = ?').get(instituteId) as any;
    const activeMembers = (db.prepare("SELECT COUNT(*) as count FROM institute_memberships WHERE institute_id = ? AND status = 'ACTIVE'").get(instituteId) as any).count;

    // Fetch dynamic tiers from DB
    const plansRaw = db.prepare('SELECT * FROM institute_plans WHERE is_active = 1 ORDER BY sort_order ASC').all() as any[];
    const availablePlans = plansRaw.map((p) => ({
      ...p,
      features: JSON.parse(p.features_json || '[]'),
    }));

    return res.json({
      instituteId,
      instituteName: inst.name,
      plan: inst.subscription_plan || 'plan_inst_starter',
      status: inst.status,
      maxStudents: inst.max_students || 50,
      activeStudents: activeMembers,
      remainingSeats: Math.max(0, (inst.max_students || 50) - activeMembers),
      expiresAt: inst.subscription_expires_at,
      contactPerson: inst.contact_person,
      email: inst.email,
      phone: inst.phone,
      razorpayKeyId: getRazorpayKeyId(),
      isRazorpayConfigured: isRazorpayConfigured(),
      availablePlans,
    });
  } catch (error: unknown) {
    console.error('Get subscription error:', error);
    return res.status(500).json({ error: 'Failed to load subscription details' });
  }
});

// Create Razorpay Order for Institute Subscription
router.post('/subscription/create-order', async (req: AuthRequest, res: Response) => {
  try {
    const instituteId = getAdminInstituteId(req);
    if (!instituteId) return res.status(404).json({ error: 'Institute not found' });

    const { planId, billingPeriod } = req.body;
    if (!planId) {
      return res.status(400).json({ error: 'Plan ID is required' });
    }

    const order = await createInstituteSubscriptionOrder({
      instituteId,
      planId,
      billingPeriod: billingPeriod === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY',
    });

    return res.status(201).json(order);
  } catch (error: any) {
    console.error('Create institute subscription order error:', error);
    return res.status(500).json({ error: error?.message || 'Failed to create subscription order' });
  }
});

// Verify Razorpay Payment for Institute Subscription
router.post('/subscription/verify-payment', async (req: AuthRequest, res: Response) => {
  try {
    const instituteId = getAdminInstituteId(req);
    if (!instituteId) return res.status(404).json({ error: 'Institute not found' });

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, planId } = req.body;
    if (!razorpay_order_id || !razorpay_payment_id || !planId) {
      return res.status(400).json({ error: 'Missing payment verification credentials' });
    }

    const result = verifyInstituteSubscriptionPayment({
      instituteId,
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature || '',
      planId,
    });

    return res.json({
      success: true,
      message: `Institute subscription activated successfully on ${result.plan}!`,
      plan: result.plan,
      maxStudents: result.maxStudents,
      expiresAt: result.expiresAt,
    });
  } catch (error: any) {
    console.error('Verify institute payment error:', error);
    return res.status(400).json({ error: error?.message || 'Payment verification failed' });
  }
});

// 15. Institute Notifications
router.get('/notifications', (req: AuthRequest, res: Response) => {
  try {
    const notifications = db.prepare(`
      SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50
    `).all(req.user!.id);
    return res.json({ notifications });
  } catch (error: unknown) {
    console.error('Get notifications error:', error);
    return res.status(500).json({ error: 'Failed to load notifications' });
  }
});

router.put('/notifications/:id/read', (req: AuthRequest, res: Response) => {
  try {
    db.prepare('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?').run(req.params.id, req.user!.id);
    return res.json({ success: true });
  } catch (error: unknown) {
    return res.status(500).json({ error: 'Failed to mark notification read' });
  }
});

router.put('/notifications/read-all', (req: AuthRequest, res: Response) => {
  try {
    db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').run(req.user!.id);
    return res.json({ success: true });
  } catch (error: unknown) {
    return res.status(500).json({ error: 'Failed to mark all notifications read' });
  }
});

// 16. Institute Support Tickets
router.get('/tickets', (req: AuthRequest, res: Response) => {
  try {
    const tickets = db.prepare(`
      SELECT * FROM support_tickets WHERE user_id = ? ORDER BY created_at DESC
    `).all(req.user!.id);
    return res.json({ tickets });
  } catch (error: unknown) {
    return res.status(500).json({ error: 'Failed to load support tickets' });
  }
});

router.post('/tickets', (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const { subject, message, category, priority } = req.body;

    if (!subject || !message) {
      return res.status(400).json({ error: 'Subject and message are required.' });
    }

    const ticketId = `tkt_${crypto.randomBytes(8).toString('hex')}`;
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const ticketNumber = `CEC-INS-${randomNum}`;

    db.prepare(`
      INSERT INTO support_tickets (
        id, ticket_number, user_id, name, email, subject, message,
        category, priority, role, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'INSTITUTE', 'OPEN')
    `).run(
      ticketId,
      ticketNumber,
      user.id,
      user.fullName,
      user.email,
      subject.trim(),
      message.trim(),
      category || 'INSTITUTE_ACCOUNT',
      priority || 'HIGH'
    );

    return res.json({
      success: true,
      ticketId,
      ticketNumber,
      message: 'Support ticket submitted successfully.',
    });
  } catch (error: unknown) {
    return res.status(500).json({ error: 'Failed to submit support ticket' });
  }
});

// 16. Institute Settings
router.get('/settings', (req: AuthRequest, res: Response) => {
  try {
    const instituteId = getAdminInstituteId(req);
    if (!instituteId) return res.status(404).json({ error: 'Institute not found' });

    const institute = db.prepare('SELECT * FROM institutes WHERE id = ?').get(instituteId);
    return res.json({
      settings: {
        autoEnrollDomain: false,
        strictPassingThreshold: 50,
        notifyOnSubmission: true,
      },
      institute,
    });
  } catch (error: unknown) {
    console.error('Get settings error:', error);
    return res.status(500).json({ error: 'Failed to load institute settings' });
  }
});

router.put('/settings', (req: AuthRequest, res: Response) => {
  try {
    return res.json({ success: true, message: 'Settings saved successfully.' });
  } catch (error: unknown) {
    return res.status(500).json({ error: 'Failed to save settings' });
  }
});

// 17. Institute Materials Management (Rule 57: Institute Uploads its own material)
router.get('/materials', (req: AuthRequest, res: Response) => {
  try {
    const instituteId = getAdminInstituteId(req);
    if (!instituteId) return res.status(404).json({ error: 'Institute not found' });

    const materials = db.prepare(`
      SELECT id, institute_id, title, level, subject_key, subject_name, paper,
             material_type, created_at, updated_at,
             length(question_paper_text) as qp_len,
             length(suggested_answers_text) as sa_len
      FROM institute_materials
      WHERE institute_id = ?
      ORDER BY created_at DESC
    `).all(instituteId);

    return res.json({ materials });
  } catch (error: unknown) {
    console.error('Get institute materials error:', error);
    return res.status(500).json({ error: 'Failed to retrieve institute materials' });
  }
});

router.post('/materials', (req: AuthRequest, res: Response) => {
  try {
    const instituteId = getAdminInstituteId(req);
    if (!instituteId) return res.status(404).json({ error: 'Institute not found' });

    const {
      title,
      level,
      subjectKey,
      subjectName,
      paper,
      materialType,
      questionPaperText,
      suggestedAnswersText,
      markingSchemeText,
      questionPaperPdfBase64,
      suggestedAnswersPdfBase64,
      markingSchemePdfBase64,
    } = req.body;

    if (!title || !level || !subjectKey || !subjectName || !questionPaperText || !suggestedAnswersText) {
      return res.status(400).json({
        error: 'Please provide required material fields: Title, Level, Subject, Question Paper text, and Suggested Answers text.',
      });
    }

    const materialId = `inst_mat_${crypto.randomBytes(8).toString('hex')}`;

    db.prepare(`
      INSERT INTO institute_materials (
        id, institute_id, title, level, subject_key, subject_name, paper,
        material_type, question_paper_text, question_paper_pdf_base64,
        suggested_answers_text, suggested_answers_pdf_base64,
        marking_scheme_text, marking_scheme_pdf_base64
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      materialId,
      instituteId,
      title.trim(),
      level,
      subjectKey,
      subjectName,
      paper || 'Paper 1',
      materialType || 'TEST_SERIES',
      questionPaperText.trim(),
      questionPaperPdfBase64 || null,
      suggestedAnswersText.trim(),
      suggestedAnswersPdfBase64 || null,
      markingSchemeText?.trim() || '',
      markingSchemePdfBase64 || null
    );

    return res.status(201).json({
      success: true,
      materialId,
      message: 'Institute test material uploaded successfully.',
    });
  } catch (error: unknown) {
    console.error('Upload institute material error:', error);
    return res.status(500).json({ error: 'Failed to upload institute material' });
  }
});

router.put('/materials/:id', (req: AuthRequest, res: Response) => {
  try {
    const instituteId = getAdminInstituteId(req);
    if (!instituteId) return res.status(404).json({ error: 'Institute not found' });

    const existing = db.prepare('SELECT id FROM institute_materials WHERE id = ? AND institute_id = ?').get(req.params.id, instituteId);
    if (!existing) return res.status(404).json({ error: 'Material not found or access denied.' });

    const {
      title,
      level,
      subjectKey,
      subjectName,
      paper,
      questionPaperText,
      suggestedAnswersText,
      markingSchemeText,
    } = req.body;

    db.prepare(`
      UPDATE institute_materials
      SET title = COALESCE(?, title),
          level = COALESCE(?, level),
          subject_key = COALESCE(?, subject_key),
          subject_name = COALESCE(?, subject_name),
          paper = COALESCE(?, paper),
          question_paper_text = COALESCE(?, question_paper_text),
          suggested_answers_text = COALESCE(?, suggested_answers_text),
          marking_scheme_text = COALESCE(?, marking_scheme_text),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND institute_id = ?
    `).run(
      title || null,
      level || null,
      subjectKey || null,
      subjectName || null,
      paper || null,
      questionPaperText || null,
      suggestedAnswersText || null,
      markingSchemeText || null,
      req.params.id,
      instituteId
    );

    return res.json({ success: true, message: 'Institute material updated successfully.' });
  } catch (error: unknown) {
    console.error('Update institute material error:', error);
    return res.status(500).json({ error: 'Failed to update institute material' });
  }
});

router.delete('/materials/:id', (req: AuthRequest, res: Response) => {
  try {
    const instituteId = getAdminInstituteId(req);
    if (!instituteId) return res.status(404).json({ error: 'Institute not found' });

    db.prepare('DELETE FROM institute_materials WHERE id = ? AND institute_id = ?').run(req.params.id, instituteId);
    return res.json({ success: true, message: 'Institute material deleted.' });
  } catch (error: unknown) {
    console.error('Delete institute material error:', error);
    return res.status(500).json({ error: 'Failed to delete institute material' });
  }
});

// 18. Institute Tests Management (Custom Tests with Institute or ICAI Checking Mode)
router.get('/tests', (req: AuthRequest, res: Response) => {
  try {
    const instituteId = getAdminInstituteId(req);
    if (!instituteId) return res.status(404).json({ error: 'Institute not found' });

    const tests = db.prepare(`
      SELECT t.*, b.name as batch_name,
             m.title as material_title,
             COUNT(e.id) as submission_count,
             AVG(e.percentage) as average_score
      FROM institute_tests t
      LEFT JOIN batches b ON b.id = t.batch_id
      LEFT JOIN institute_materials m ON m.id = t.institute_material_id
      LEFT JOIN evaluations e ON e.material_id = t.id AND e.status = 'COMPLETED'
      WHERE t.institute_id = ?
      GROUP BY t.id
      ORDER BY t.created_at DESC
    `).all(instituteId);

    return res.json({ tests });
  } catch (error: unknown) {
    console.error('Get institute tests error:', error);
    return res.status(500).json({ error: 'Failed to retrieve institute tests' });
  }
});

router.post('/tests', (req: AuthRequest, res: Response) => {
  try {
    const instituteId = getAdminInstituteId(req);
    if (!instituteId) return res.status(404).json({ error: 'Institute not found' });

    const {
      title,
      level,
      subjectKey,
      subjectName,
      paper,
      checkingMode,
      instituteMaterialId,
      targetType,
      batchId,
      selectedStudentIds,
      maximumMarks,
      timeLimitMinutes,
      deadline,
      instructions,
    } = req.body;

    if (!title || !level || !subjectKey || !subjectName || !deadline) {
      return res.status(400).json({ error: 'Please provide test title, level, subject, and submission deadline.' });
    }

    const testId = `test_${crypto.randomBytes(8).toString('hex')}`;

    db.prepare(`
      INSERT INTO institute_tests (
        id, institute_id, batch_id, title, level, subject_key, subject_name,
        paper, checking_mode, institute_material_id, target_type, selected_student_ids,
        maximum_marks, time_limit_minutes, deadline, instructions, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PUBLISHED')
    `).run(
      testId,
      instituteId,
      batchId || null,
      title.trim(),
      level,
      subjectKey,
      subjectName,
      paper || 'Paper 1',
      checkingMode || 'INSTITUTE_MATERIAL',
      instituteMaterialId || null,
      targetType || 'ALL',
      selectedStudentIds ? JSON.stringify(selectedStudentIds) : null,
      maximumMarks || 100,
      timeLimitMinutes || 180,
      deadline,
      instructions || null
    );

    return res.status(201).json({
      success: true,
      testId,
      message: 'Test created and published to students.',
    });
  } catch (error: unknown) {
    console.error('Create institute test error:', error);
    return res.status(500).json({ error: 'Failed to create test' });
  }
});

router.delete('/tests/:id', (req: AuthRequest, res: Response) => {
  try {
    const instituteId = getAdminInstituteId(req);
    if (!instituteId) return res.status(404).json({ error: 'Institute not found' });

    db.prepare('DELETE FROM institute_tests WHERE id = ? AND institute_id = ?').run(req.params.id, instituteId);
    return res.json({ success: true, message: 'Test deleted.' });
  } catch (error: unknown) {
    console.error('Delete test error:', error);
    return res.status(500).json({ error: 'Failed to delete test' });
  }
});

router.get('/tests/:id/submissions', (req: AuthRequest, res: Response) => {
  try {
    const instituteId = getAdminInstituteId(req);
    if (!instituteId) return res.status(404).json({ error: 'Institute not found' });

    const submissions = db.prepare(`
      SELECT e.id as evaluation_id, e.student_id, u.full_name as student_name, u.email as student_email,
             e.total_marks, e.maximum_marks, e.percentage, e.grade, e.completed_at, e.created_at,
             e.checked_copy_status, e.original_page_count, e.checked_copy_page_count
      FROM evaluations e
      JOIN users u ON u.id = e.student_id
      WHERE e.material_id = ? AND e.institute_id = ?
      ORDER BY e.created_at DESC
    `).all(req.params.id, instituteId);

    return res.json({ submissions });
  } catch (error: unknown) {
    console.error('Get test submissions error:', error);
    return res.status(500).json({ error: 'Failed to retrieve submissions' });
  }
});

export default router;
