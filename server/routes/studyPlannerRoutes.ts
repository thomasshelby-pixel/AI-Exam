import { Router, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { db } from '../db.js';
import { CA_CURRICULUM } from '../../src/data/caCurriculum.js';
import { authenticateToken, AuthRequest } from '../auth.js';
import {
  createStudyPlanDraft,
  parseStudyPlannerRequest,
} from '../services/studyPlannerEngine.js';

const router = Router();
const MAX_MESSAGE_LENGTH = 1200;

const ALLOWED_STRENGTHS = new Set(['STRONG', 'MODERATE', 'WEAK']);


// Chapter labels are maintained against the current shared CA Intermediate subject registry.
 // More granular chapter names are used where the shared registry currently stores only broad areas.
const INTERMEDIATE_CHAPTERS: Record<string, string[]> = {
  'Advanced Accounting': [
    'Accounting Standards (AS 1, AS 2, AS 3, AS 4, AS 5)',
    'Accounting Standards (AS 7, AS 9, AS 10, AS 11, AS 12)',
    'Accounting Standards (AS 13, AS 14, AS 16, AS 17, AS 18)',
    'Accounting Standards (AS 19, AS 20, AS 22, AS 24, AS 26, AS 28, AS 29)',
    'Company Accounts',
    'Amalgamation of Companies',
    'Internal Reconstruction',
    'Branch Accounts',
    'Consolidated Financial Statements',
  ],
  'Corporate and Other Laws': [
    'Preliminary and Incorporation of Company',
    'Prospectus and Allotment of Securities',
    'Share Capital and Debentures',
    'Acceptance of Deposits',
    'Registration of Charges',
    'Management and Administration',
    'Declaration and Payment of Dividend',
    'Accounts of Companies',
    'Audit and Auditors',
    'Companies Incorporated Outside India',
    'The Limited Liability Partnership Act, 2008',
    'The General Clauses Act, 1897',
    'Interpretation of Statutes',
    'The Foreign Exchange Management Act, 1999',
  ],
  'Taxation (Income Tax & GST)': [
    'Basic Concepts and Residential Status',
    'Income from Salaries',
    'Income from House Property',
    'Profits and Gains from Business or Profession',
    'Capital Gains',
    'Income from Other Sources',
    'Clubbing of Income',
    'Set-off and Carry Forward of Losses',
    'Deductions from Gross Total Income',
    'Advance Tax, TDS and TCS',
    'Return of Income and Self-Assessment',
    'GST: Supply and Levy',
    'GST: Place of Supply',
    'GST: Exemptions',
    'GST: Time and Value of Supply',
    'GST: Input Tax Credit',
    'GST: Registration',
    'GST: Tax Invoice, Credit and Debit Notes',
    'GST: Accounts and Records',
    'GST: E-Way Bill',
    'GST: Payment of Tax',
  ],
  'Cost and Management Accounting': [
    'Introduction to Cost and Management Accounting',
    'Material Cost',
    'Employee Cost',
    'Direct Expenses',
    'Overheads',
    'Activity Based Costing',
    'Cost Sheet',
    'Cost Accounting Systems',
    'Unit and Batch Costing',
    'Job Costing and Contract Costing',
    'Process and Joint Products Costing',
    'Service Costing',
    'Standard Costing',
    'Marginal Costing',
    'Budget and Budgetary Control',
  ],
  'Auditing and Ethics': [
    'Nature, Objective and Scope of Audit',
    'Audit Strategy, Planning and Programme',
    'Risk Assessment and Internal Control',
    'Audit Evidence',
    'Audit Documentation',
    'Audit Sampling',
    'Analytical Procedures',
    'Audit of Items of Financial Statements',
    'Company Audit',
    'Audit Report',
    'Audit of Banks',
    'Audit of Different Types of Entities',
    'Ethics and Terms of Engagement',
    'Standards on Auditing (SA 200 series)',
    'Standards on Auditing (SA 300 series)',
    'Standards on Auditing (SA 500 series)',
    'Standards on Auditing (SA 700 series)',
  ],
  'Financial Management and Strategic Management': [
    'Scope and Objectives of Financial Management',
    'Types of Financing',
    'Financial Analysis and Planning',
    'Cost of Capital',
    'Capital Structure',
    'Leverages',
    'Investment Decisions',
    'Dividend Decisions',
    'Management of Working Capital',
    'Introduction to Strategic Management',
    'Strategic Intent and Mission',
    'External and Internal Environment Analysis',
    'Industrial and Competitive Analysis',
    'Strategic Choices',
    'Strategy Implementation and Evaluation',
  ],
};

function getIntermediateChapterOptions() {
  return CA_CURRICULUM.INTERMEDIATE.subjects.map((subject) => ({
    key: subject.key,
    name: subject.name,
    paperNumber: subject.paperNumber,
    group: subject.group || null,
    chapters: INTERMEDIATE_CHAPTERS[subject.name]
      || [...(subject.keyProvisions || []), ...(subject.accountingStandards || [])],
  }));
}


const PRIORITY_SUBJECT_ALIASES: Record<string, string[]> = {
  'Taxation': ['Taxation (Income Tax & GST)', 'Taxation'],
  'Costing': ['Cost and Management Accounting', 'Costing'],
  'Cost and Management Accounting': ['Cost and Management Accounting', 'Costing'],
  'Law': ['Corporate and Other Laws', 'Law'],
  'Corporate and Other Laws': ['Corporate and Other Laws', 'Law'],
  'Audit': ['Auditing and Ethics', 'Audit'],
  'Auditing and Ethics': ['Auditing and Ethics', 'Audit'],
  'Advanced Accounting': ['Advanced Accounting'],
  'Financial Management and Strategic Management': ['Financial Management and Strategic Management', 'FM and SM'],
};

function getCanonicalStrengthSubject(subject: string): string[] {
  return PRIORITY_SUBJECT_ALIASES[subject] || [subject];
}

router.post('/mock-results', authenticateToken, (req: AuthRequest, res: Response) => {
  if (!req.user || String(req.user.role).toUpperCase() !== 'STUDENT') {
    return res.status(403).json({ success: false, error: 'Student account required.' });
  }
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const course = String(body.course || '').toUpperCase();
  const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
  const score = Number(body.score);
  const maxScore = Number(body.max_score);
  const source = String(body.source || 'MOCK_TEST').toUpperCase();
  const examDate = typeof body.exam_date === 'string' && /^\\d{4}-\\d{2}-\\d{2}$/.test(body.exam_date)
    ? body.exam_date
    : new Date().toISOString().slice(0, 10);
  const allowedSubjects = CA_CURRICULUM.INTERMEDIATE.subjects.map((item) => item.name);
  const validSubject = allowedSubjects.includes(subject) || ['Taxation', 'Costing', 'Law', 'Audit', 'FM and SM'].includes(subject);
  if (course !== 'CA_INTERMEDIATE' || !validSubject || !Number.isFinite(score) || !Number.isFinite(maxScore) || maxScore <= 0 || score < 0 || score > maxScore || maxScore > 1000 || !['SELF_REPORTED', 'MOCK_TEST', 'PAST_PAPER'].includes(source)) {
    return res.status(400).json({ success: false, error: 'Provide a valid subject, score, maximum marks and source.' });
  }
  const id = randomUUID();
  db.prepare('INSERT INTO student_mock_results (id, user_id, course, subject, score, max_score, exam_date, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, req.user.id, course, subject, score, maxScore, examDate, source);
  return res.status(201).json({ success: true, id, percentage: Math.round((score / maxScore) * 1000) / 10 });
});

router.get('/priorities', authenticateToken, (req: AuthRequest, res: Response) => {
  if (!req.user || String(req.user.role).toUpperCase() !== 'STUDENT') {
    return res.status(403).json({ success: false, error: 'Student account required.' });
  }
  const course = String(req.query.course || 'CA_INTERMEDIATE').toUpperCase();
  if (course !== 'CA_INTERMEDIATE') {
    return res.status(400).json({ success: false, error: 'Adaptive priorities are currently available for CA Intermediate only.' });
  }
  const strengths = db.prepare('SELECT subject, chapter, strength, updated_at FROM student_chapter_strengths WHERE user_id = ? AND course = ? AND chapter != ?')
    .all(req.user.id, course, '__SUBJECT_LEVEL__') as Array<{ subject: string; chapter: string; strength: string; updated_at: string }>;
  const results = db.prepare('SELECT subject, score, max_score, exam_date, source FROM student_mock_results WHERE user_id = ? AND course = ? ORDER BY exam_date DESC, created_at DESC LIMIT 200')
    .all(req.user.id, course) as Array<{ subject: string; score: number; max_score: number; exam_date: string; source: string }>;
  const latestBySubject = new Map<string, { subject: string; score: number; max_score: number; exam_date: string; source: string }>();
  for (const result of results) {
    if (!latestBySubject.has(result.subject)) latestBySubject.set(result.subject, result);
  }
  const subjects = CA_CURRICULUM.INTERMEDIATE.subjects;
  const priorities = strengths.map((item) => {
    const aliases = getCanonicalStrengthSubject(item.subject);
    const matchingSubject = subjects.find((subject) => aliases.includes(subject.name));
    const canonicalNames = new Set([item.subject, matchingSubject?.name || '', ...aliases]);
    const mock = [...latestBySubject.values()].find((result) => canonicalNames.has(result.subject) || getCanonicalStrengthSubject(result.subject).some((alias) => canonicalNames.has(alias)));
    const strengthRisk = item.strength === 'WEAK' ? 100 : item.strength === 'MODERATE' ? 55 : 15;
    const mockRisk = mock ? Math.max(0, Math.min(100, 100 - (mock.score / mock.max_score) * 100)) : null;
    const score = mockRisk === null ? strengthRisk : Math.round(strengthRisk * 0.6 + mockRisk * 0.4);
    return {
      subject: item.subject,
      chapter: item.chapter,
      strength: item.strength,
      mock_percentage: mock ? Math.round((mock.score / mock.max_score) * 1000) / 10 : null,
      mock_exam_date: mock?.exam_date || null,
      priority_score: score,
      priority: score >= 70 ? 'HIGH' : score >= 40 ? 'MEDIUM' : 'LOW',
      rationale: mock
        ? item.strength.toLowerCase() + ' self-assessment combined with ' + Math.round((mock.score / mock.max_score) * 100) + '% in the latest matching subject result.'
        : item.strength.toLowerCase() + ' self-assessment; add a mock result for a more evidence-based ranking.',
    };
  }).sort((a, b) => b.priority_score - a.priority_score || a.subject.localeCompare(b.subject) || a.chapter.localeCompare(b.chapter));
  return res.json({
    success: true,
    course,
    formula: 'priority = 60% self-assessed weakness + 40% latest matching mock-score risk; higher means higher revision priority',
    priorities,
    mock_results: results.slice(0, 30),
  });
});

router.post('/daily-schedule', authenticateToken, (req: AuthRequest, res: Response) => {
  if (!req.user || String(req.user.role).toUpperCase() !== 'STUDENT') {
    return res.status(403).json({ success: false, error: 'Student account required.' });
  }
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const course = String(body.course || 'CA_INTERMEDIATE').toUpperCase();
  const date = typeof body.date === 'string' ? body.date : '';
  const availableMinutes = Number(body.available_minutes);
  if (course !== 'CA_INTERMEDIATE') {
    return res.status(400).json({ success: false, error: 'Daily schedules are currently available for CA Intermediate only.' });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date + 'T00:00:00.000Z').toISOString().slice(0, 10) !== date) {
    return res.status(400).json({ success: false, error: 'Provide a valid date in YYYY-MM-DD format.' });
  }
  if (!Number.isInteger(availableMinutes) || availableMinutes < 30 || availableMinutes > 720) {
    return res.status(400).json({ success: false, error: 'Study time must be an integer between 30 and 720 minutes.' });
  }

  const strengths = db.prepare(
    'SELECT subject, chapter, strength FROM student_chapter_strengths WHERE user_id = ? AND course = ? AND chapter != ?'
  ).all(req.user.id, course, '__SUBJECT_LEVEL__') as Array<{ subject: string; chapter: string; strength: string }>;
  const results = db.prepare(
    'SELECT subject, score, max_score, exam_date FROM student_mock_results WHERE user_id = ? AND course = ? ORDER BY exam_date DESC, created_at DESC LIMIT 200'
  ).all(req.user.id, course) as Array<{ subject: string; score: number; max_score: number; exam_date: string }>;
  const latestBySubject = new Map<string, { subject: string; score: number; max_score: number; exam_date: string }>();
  for (const result of results) if (!latestBySubject.has(result.subject)) latestBySubject.set(result.subject, result);

  const priorities = strengths.map((item) => {
    const aliases = getCanonicalStrengthSubject(item.subject);
    const matchingSubject = CA_CURRICULUM.INTERMEDIATE.subjects.find((subject) => aliases.includes(subject.name));
    const canonicalNames = new Set([item.subject, matchingSubject?.name || '', ...aliases]);
    const mock = [...latestBySubject.values()].find((result) =>
      canonicalNames.has(result.subject) || getCanonicalStrengthSubject(result.subject).some((alias) => canonicalNames.has(alias))
    );
    const strengthRisk = item.strength === 'WEAK' ? 100 : item.strength === 'MODERATE' ? 55 : 15;
    const mockRisk = mock ? Math.max(0, Math.min(100, 100 - (mock.score / mock.max_score) * 100)) : null;
    const score = mockRisk === null ? strengthRisk : Math.round(strengthRisk * 0.6 + mockRisk * 0.4);
    return { subject: item.subject, chapter: item.chapter, strength: item.strength, priority_score: score };
  });

  try {
    const schedule = createDailyStudySchedule({ date, available_minutes: availableMinutes, priorities });
    return res.json({ success: true, course, schedule });
  } catch (error) {
    return res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Could not create a daily schedule.' });
  }
});

router.get('/curriculum', authenticateToken, (req: AuthRequest, res: Response) => {
  if (!req.user || String(req.user.role).toUpperCase() !== 'STUDENT') {
    return res.status(403).json({ success: false, error: 'Student account required.' });
  }
  const course = String(req.query.course || 'CA_INTERMEDIATE').toUpperCase();
  if (course !== 'CA_INTERMEDIATE') {
    return res.status(400).json({ success: false, error: 'Chapter-level assessment is currently available for CA Intermediate only.' });
  }
  return res.json({
    success: true,
    course,
    source: 'CA_CURRICULUM',
    subjects: getIntermediateChapterOptions(),
  });
});

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
  const allowedSubject = course === 'CA_INTERMEDIATE'
    ? CA_CURRICULUM.INTERMEDIATE.subjects.find((item) => item.name === subject)
    : undefined;
  const allowedTopics = allowedSubject
    ? [...(allowedSubject.keyProvisions || []), ...(allowedSubject.accountingStandards || [])]
    : [];
  const validLegacySubjectRating = chapter === '__SUBJECT_LEVEL__'
    && course === 'CA_INTERMEDIATE'
    && Boolean(allowedSubject);
  if (
    course !== 'CA_INTERMEDIATE'
    || !allowedSubject
    || subject.length > 160
    || !chapter
    || chapter.length > 200
    || (!validLegacySubjectRating && !allowedTopics.includes(chapter))
    || !ALLOWED_STRENGTHS.has(strength)
  ) {
    return res.status(400).json({ success: false, error: 'Choose a subject and chapter from the supported CA Intermediate curriculum.' });
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
