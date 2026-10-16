import { Router, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { db } from '../db.js';
import { authenticateToken, AuthRequest } from '../auth.js';
import {
  createStudyPlanDraft,
  parseStudyPlannerRequest,
} from '../services/studyPlannerEngine.js';

const router = Router();
const MAX_MESSAGE_LENGTH = 1200;

const ALLOWED_STRENGTHS = new Set(['STRONG', 'MODERATE', 'WEAK']);

router.get('/profile', authenticateToken, (req: AuthRequest, res: Response) => {
  if (!req.user || String(req.user.role).toUpperCase() !== 'STUDENT') {
    return res.status(403).json({ success: false, error: 'Student account required.' });
  }
  const course = String(req.query.course || 'CA_INTERMEDIATE').toUpperCase();
  if (!['CA_FOUNDATION', 'CA_INTERMEDIATE'].includes(course)) {
    return res.status(400).json({ success: false, error: 'Unsupported CA course.' });
  }
  const strengths = db.prepare(
    'SELECT subject, chapter, strength, updated_at FROM student_chapter_strengths WHERE user_id = ? AND course = ? ORDER BY subject, chapter'
  ).all(req.user.id, course);
  const recentPlans = db.prepare(
    'SELECT id, course, title, status, created_at, completed_at, plan_json FROM student_study_plans WHERE user_id = ? AND course = ? ORDER BY created_at DESC LIMIT 20'
  ).all(req.user.id, course) as Array<Record<string, any>>;
  const plans = recentPlans.map((plan) => {
    let parsedPlan: unknown = null;
    try { parsedPlan = JSON.parse(String(plan.plan_json)); } catch {}
    return { ...plan, plan: parsedPlan };
  });
  const progress = db.prepare(
    'SELECT id, plan_id, subject, chapter, activity, duration_minutes, studied_on, notes FROM student_study_progress WHERE user_id = ? AND course = ? ORDER BY studied_on DESC, created_at DESC LIMIT 100'
  ).all(req.user.id, course);
  return res.json({ success: true, course, strengths, plans, progress });
});

router.put('/strengths', authenticateToken, (req: AuthRequest, res: Response) => {
  if (!req.user || String(req.user.role).toUpperCase() !== 'STUDENT') {
    return res.status(403).json({ success: false, error: 'Student account required.' });
  }
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const course = String(body.course || '').toUpperCase();
  const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
  const chapter = typeof body.chapter === 'string' ? body.chapter.trim() : '';
  const strength = String(body.strength || '').toUpperCase();
  if (!['CA_FOUNDATION', 'CA_INTERMEDIATE'].includes(course) || !subject || subject.length > 160 || !chapter || chapter.length > 200 || !ALLOWED_STRENGTHS.has(strength)) {
    return res.status(400).json({ success: false, error: 'Provide a valid course, subject, chapter and strength.' });
  }
  db.prepare(`
    INSERT INTO student_chapter_strengths (id, user_id, course, subject, chapter, strength, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id, course, subject, chapter)
    DO UPDATE SET strength = excluded.strength, updated_at = CURRENT_TIMESTAMP
  `).run(randomUUID(), req.user.id, course, subject, chapter, strength);
  return res.json({ success: true, subject, chapter, strength });
});

router.post('/plans', authenticateToken, (req: AuthRequest, res: Response) => {
  if (!req.user || String(req.user.role).toUpperCase() !== 'STUDENT') {
    return res.status(403).json({ success: false, error: 'Student account required.' });
  }
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const course = String(body.course || '').toUpperCase();
  const plan = body.plan;
  if (!['CA_FOUNDATION', 'CA_INTERMEDIATE'].includes(course) || !plan || typeof plan !== 'object' || !Array.isArray(plan.sessions) || plan.sessions.length < 1 || plan.sessions.length > 100) {
    return res.status(400).json({ success: false, error: 'Provide a valid study-plan draft.' });
  }
  const total = Number(plan.total_minutes);
  const sum = plan.sessions.reduce((n: number, session: any) => n + Number(session?.minutes || 0), 0);
  if (!Number.isInteger(total) || total < 1 || total > 1440 || sum !== total || plan.sessions.some((s: any) => !s || typeof s.subject !== 'string' || typeof s.label !== 'string' || !Number.isInteger(s.minutes) || s.minutes < 1)) {
    return res.status(400).json({ success: false, error: 'Study-plan sessions failed validation.' });
  }
  const id = randomUUID();
  const title = String(plan.title || 'Study plan').slice(0, 180);
  db.prepare('INSERT INTO student_study_plans (id, user_id, course, title, plan_json) VALUES (?, ?, ?, ?, ?)')
    .run(id, req.user.id, course, title, JSON.stringify(plan));
  return res.status(201).json({ success: true, id, title, status: 'ACTIVE' });
});

router.post('/progress', authenticateToken, (req: AuthRequest, res: Response) => {
  if (!req.user || String(req.user.role).toUpperCase() !== 'STUDENT') {
    return res.status(403).json({ success: false, error: 'Student account required.' });
  }
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const course = String(body.course || '').toUpperCase();
  const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
  const chapter = typeof body.chapter === 'string' ? body.chapter.trim().slice(0, 200) : null;
  const activity = typeof body.activity === 'string' ? body.activity.trim() : '';
  const duration = Number(body.duration_minutes);
  const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 1000) : null;
  const studiedOn = typeof body.studied_on === 'string' && /^\\d{4}-\\d{2}-\\d{2}$/.test(body.studied_on) ? body.studied_on : new Date().toISOString().slice(0, 10);
  if (!['CA_FOUNDATION', 'CA_INTERMEDIATE'].includes(course) || !subject || subject.length > 160 || !activity || activity.length > 120 || !Number.isInteger(duration) || duration < 1 || duration > 1440) {
    return res.status(400).json({ success: false, error: 'Provide valid study progress details.' });
  }
  const planId = typeof body.plan_id === 'string' ? body.plan_id : null;
  if (planId) {
    const owned = db.prepare('SELECT id FROM student_study_plans WHERE id = ? AND user_id = ? AND course = ?').get(planId, req.user.id, course);
    if (!owned) return res.status(404).json({ success: false, error: 'Study plan not found.' });
  }
  const id = randomUUID();
  db.prepare('INSERT INTO student_study_progress (id, user_id, plan_id, course, subject, chapter, activity, duration_minutes, studied_on, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, req.user.id, planId, course, subject, chapter, activity, duration, studiedOn, notes);
  return res.status(201).json({ success: true, id });
});

router.patch('/plans/:planId/complete', authenticateToken, (req: AuthRequest, res: Response) => {
  if (!req.user || String(req.user.role).toUpperCase() !== 'STUDENT') {
    return res.status(403).json({ success: false, error: 'Student account required.' });
  }
  const result = db.prepare("UPDATE student_study_plans SET status = 'COMPLETED', completed_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND status = 'ACTIVE'")
    .run(String(req.params.planId), req.user.id);
  if (!result.changes) return res.status(404).json({ success: false, error: 'Active study plan not found.' });
  return res.json({ success: true, status: 'COMPLETED' });
});

const ALLOWED_COURSES = new Set([
  '',
  'CA_FOUNDATION',
  'CA_INTERMEDIATE',
  'CA_FINAL',
  'foundation',
  'intermediate',
  'inter',
  'final',
]);

router.post('/', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || String(req.user.role).toUpperCase() !== 'STUDENT') {
      return res.status(403).json({
        success: false,
        error: 'The study planner is currently available to student accounts only.',
      });
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    const course = typeof body.course === 'string' ? body.course.trim() : '';

    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'Enter your study request first.',
      });
    }

    if (message.length > MAX_MESSAGE_LENGTH) {
      return res.status(413).json({
        success: false,
        error: 'Keep your request under ' + MAX_MESSAGE_LENGTH + ' characters.',
      });
    }

    if (!ALLOWED_COURSES.has(course)) {
      return res.status(400).json({
        success: false,
        error: 'Select a valid CA level.',
      });
    }

    const parsed = parseStudyPlannerRequest(message, course || null);
    const plan = createStudyPlanDraft(parsed);

    let status = 'request_parsed';
    let responseMessage = 'Request parsed. This beta does not save class changes, study progress, or chapter priorities.';

    if (parsed.intent === 'out_of_scope') {
      status = 'unsupported_course';
      responseMessage = 'CA Final is not supported by this planner beta yet. Your request was not executed.';
    } else if (parsed.intent === 'clarify') {
      status = 'needs_clarification';
      responseMessage = 'Please provide the missing details before a study-plan draft can be created.';
    } else if (parsed.intent === 'create_study_plan' && plan) {
      status = 'plan_draft_ready';
      responseMessage = 'Your study-plan draft is ready. It has not been saved to your account or calendar.';
    } else if (parsed.intent === 'general_guidance') {
      responseMessage = 'General-guidance request recognised. This beta parses requests but does not generate general advice text.';
    } else if (parsed.intent === 'prioritize_chapters') {
      responseMessage = 'Priority request parsed. Chapter ranking is not calculated or saved in this beta yet.';
    } else if (parsed.intent === 'update_class_schedule') {
      responseMessage = 'Class-schedule details parsed. No class was changed or saved.';
    } else if (parsed.intent === 'log_study_progress') {
      responseMessage = 'Study-progress details parsed. No progress entry was saved.';
    }

    return res.status(200).json({
      success: true,
      status,
      message: responseMessage,
      parsed,
      plan,
      metadata: {
        version: '1.0.0',
        modelUsed: false,
        persistentStorage: false,
      },
    });
  } catch (error) {
    console.error('[StudyPlanner] Request failed:', error);
    return res.status(500).json({
      success: false,
      error: 'Unable to process the study request right now.',
    });
  }
});

export default router;
