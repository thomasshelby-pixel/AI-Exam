import { Router, Response } from 'express';
import crypto from 'node:crypto';
import { db } from '../db.js';
import { authenticateToken, requireRole, AuthRequest } from '../auth.js';

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
    const instByEmail = db.prepare('SELECT id FROM institutes WHERE email = ?').get(req.user!.email) as { id: string } | undefined;
    if (instByEmail) return instByEmail.id;
    const firstInst = db.prepare('SELECT id FROM institutes ORDER BY created_at ASC LIMIT 1').get() as { id: string } | undefined;
    return firstInst ? firstInst.id : null;
  }
  const inst = db.prepare('SELECT id FROM institutes WHERE email = ?').get(req.user!.email) as { id: string } | undefined;
  return inst ? inst.id : null;
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
      SELECT COALESCE(u.id, m.id) as id,
             u.id as user_id,
             COALESCE(u.full_name, m.student_name, 'Invited Student') as full_name,
             COALESCE(u.email, m.invited_email) as email,
             u.phone,
             p.icai_registration_number,
             p.ca_level,
             m.status as membership_status,
             m.joined_at,
             m.invited_email,
             b.name as batch_name,
             b.id as batch_id,
             COUNT(e.id) as evaluations_count,
             AVG(e.percentage) as average_score
      FROM institute_memberships m
      LEFT JOIN users u ON u.id = m.student_id
      LEFT JOIN student_profiles p ON p.user_id = u.id
      LEFT JOIN batches b ON b.id = m.batch_id
      LEFT JOIN evaluations e ON e.student_id = u.id AND e.status = 'COMPLETED'
      WHERE m.institute_id = ?
    `;
    const params: any[] = [instituteId];

    if (batchId) {
      query += ' AND m.batch_id = ?';
      params.push(batchId);
    }
    if (status) {
      query += ' AND m.status = ?';
      params.push(status);
    }
    if (search) {
      query += ' AND (u.full_name LIKE ? OR u.email LIKE ? OR m.invited_email LIKE ? OR p.icai_registration_number LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ' GROUP BY COALESCE(u.id, m.id) ORDER BY m.joined_at DESC';

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

    const { email, batchId, studentName, notes } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Student email is required.' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check institute capacity
    const countRow = db.prepare("SELECT COUNT(*) as count FROM institute_memberships WHERE institute_id = ? AND status = 'ACTIVE'").get(instituteId) as { count: number };
    const inst = db.prepare('SELECT max_students FROM institutes WHERE id = ?').get(instituteId) as { max_students: number };
    if (countRow.count >= inst.max_students) {
      return res.status(403).json({ error: `Institute student limit (${inst.max_students}) reached. Contact super admin to upgrade capacity.` });
    }

    const user = db.prepare('SELECT id, full_name, role FROM users WHERE lower(email) = ?').get(normalizedEmail) as {
      id: string;
      full_name: string;
      role: string;
    } | undefined;

    if (user) {
      if (user.role !== 'STUDENT') {
        return res.status(400).json({ error: 'Specified account is not a student.' });
      }

      // Existing user -> activate membership immediately
      const existingMembership = db.prepare('SELECT id FROM institute_memberships WHERE institute_id = ? AND student_id = ?').get(instituteId, user.id) as { id: string } | undefined;
      
      if (existingMembership) {
        db.prepare("UPDATE institute_memberships SET batch_id = ?, status = 'ACTIVE' WHERE id = ?").run(batchId || null, existingMembership.id);
      } else {
        const membershipId = `mem_${crypto.randomBytes(8).toString('hex')}`;
        db.prepare(`
          INSERT INTO institute_memberships (id, institute_id, student_id, batch_id, status, invited_email, student_name, notes)
          VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?, ?)
        `).run(membershipId, instituteId, user.id, batchId || null, normalizedEmail, user.full_name, notes || null);
      }

      // Link in student profile
      db.prepare(`
        UPDATE student_profiles SET institute_id = ?, batch_id = ? WHERE user_id = ?
      `).run(instituteId, batchId || null, user.id);

      // Notify student
      const notifId = `notif_${crypto.randomBytes(8).toString('hex')}`;
      db.prepare(`
        INSERT INTO notifications (id, user_id, title, message, type)
        VALUES (?, ?, 'Institute Membership Activated', 'You have been enrolled under your coaching institute. Your evaluations are now sponsored.', 'INSTITUTE')
      `).run(notifId, user.id);

      return res.status(201).json({ success: true, message: `Student ${user.full_name} enrolled successfully with full institute sponsorship.` });
    } else {
      // User has not registered yet -> record pending enrollment by email (Rule 42-44)
      const existingInvite = db.prepare('SELECT id FROM institute_memberships WHERE institute_id = ? AND lower(invited_email) = ?').get(instituteId, normalizedEmail) as { id: string } | undefined;

      if (existingInvite) {
        db.prepare("UPDATE institute_memberships SET batch_id = ?, student_name = COALESCE(?, student_name), notes = COALESCE(?, notes), status = 'PENDING' WHERE id = ?")
          .run(batchId || null, studentName || null, notes || null, existingInvite.id);
      } else {
        const membershipId = `mem_${crypto.randomBytes(8).toString('hex')}`;
        db.prepare(`
          INSERT INTO institute_memberships (id, institute_id, student_id, batch_id, status, invited_email, student_name, notes)
          VALUES (?, ?, NULL, ?, 'PENDING', ?, ?, ?)
        `).run(membershipId, instituteId, batchId || null, normalizedEmail, studentName || 'Invited Student', notes || null);
      }

      return res.status(201).json({
        success: true,
        pending: true,
        message: `Student invitation recorded for ${normalizedEmail}. When the student registers or logs in, their account will be automatically enrolled with institute sponsorship.`,
      });
    }
  } catch (error: unknown) {
    console.error('Enroll student error:', error);
    return res.status(500).json({ error: 'Failed to enroll student' });
  }
});

// 4. Remove Student from Institute (Sponsorship stops, historical evaluations preserved!)
router.delete('/students/:id', (req: AuthRequest, res: Response) => {
  try {
    const instituteId = getAdminInstituteId(req);
    if (!instituteId) return res.status(404).json({ error: 'Institute not found' });

    const studentId = req.params.id;

    // Set membership status to INACTIVE rather than deleting evaluations
    db.prepare(`
      UPDATE institute_memberships SET status = 'INACTIVE' WHERE institute_id = ? AND student_id = ?
    `).run(instituteId, studentId);

    // Clear institute reference from profile so student falls back to normal system
    db.prepare(`
      UPDATE student_profiles SET institute_id = NULL, batch_id = NULL WHERE user_id = ? AND institute_id = ?
    `).run(studentId, instituteId);

    // Notify student
    db.prepare(`
      INSERT INTO notifications (id, user_id, title, message, type)
      VALUES (?, ?, 'Institute Sponsorship Update', 'Your institute sponsorship has ended. You are now using your standard individual student account.', 'INSTITUTE')
    `).run(`notif_${crypto.randomBytes(8).toString('hex')}`, studentId);

    return res.json({ success: true, message: 'Student removed from institute. Historical evaluations remain safely intact.' });
  } catch (error: unknown) {
    console.error('Remove student error:', error);
    return res.status(500).json({ error: 'Failed to remove student' });
  }
});

// 5. Batch Management
router.get('/batches', (req: AuthRequest, res: Response) => {
  try {
    const instituteId = getAdminInstituteId(req);
    if (!instituteId) return res.status(404).json({ error: 'Institute not found' });

    const batches = db.prepare(`
      SELECT b.*, COUNT(m.id) as student_count
      FROM batches b
      LEFT JOIN institute_memberships m ON m.batch_id = b.id AND m.status = 'ACTIVE'
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

router.post('/batches', (req: AuthRequest, res: Response) => {
  try {
    const instituteId = getAdminInstituteId(req);
    if (!instituteId) return res.status(404).json({ error: 'Institute not found' });

    const { name, courseLevel, description } = req.body;
    if (!name || !courseLevel) {
      return res.status(400).json({ error: 'Batch name and course level are required.' });
    }

    const batchId = `batch_${crypto.randomBytes(8).toString('hex')}`;
    db.prepare(`
      INSERT INTO batches (id, institute_id, name, course_level, description)
      VALUES (?, ?, ?, ?, ?)
    `).run(batchId, instituteId, name.trim(), courseLevel, description?.trim() || null);

    return res.status(201).json({ success: true, batchId, message: 'Batch created successfully.' });
  } catch (error: unknown) {
    console.error('Create batch error:', error);
    return res.status(500).json({ error: 'Failed to create batch' });
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

    return res.json({
      plan: inst.subscription_plan || 'INSTITUTIONAL_PARTNER',
      status: inst.status,
      maxStudents: inst.max_students || 500,
      activeStudents: activeMembers,
      remainingSeats: Math.max(0, (inst.max_students || 500) - activeMembers),
      expiresAt: inst.subscription_expires_at,
      contactPerson: inst.contact_person,
      email: inst.email,
    });
  } catch (error: unknown) {
    console.error('Get subscription error:', error);
    return res.status(500).json({ error: 'Failed to load subscription details' });
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
