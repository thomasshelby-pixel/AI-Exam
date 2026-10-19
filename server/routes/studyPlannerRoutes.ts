import { Router, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { db } from '../db.js';
import { CA_CURRICULUM } from '../../src/data/caCurriculum.js';
import { authenticateToken, AuthRequest } from '../auth.js';
import {
  applyDefaultStudyDuration,
  createStudyPlanDraft,
  parseStudyPlannerConversationRequest,
} from '../services/studyPlannerEngine.js';
import { createDailyStudySchedule } from '../services/studyPlannerDailySchedule.js';
import { createMultiDayStudyPlan } from '../services/studyPlannerMultiDaySchedule.js';
import { createAttemptStudyPhases } from '../services/studyPlannerAttemptPhases.js';
import { createAdaptiveRevisionRounds } from '../services/studyPlannerRevisionRounds.js';
import { buildGeneralStudyAnswer, detectStudyReplyLanguage, isGeneralStudyQuestion } from '../services/studyPlannerLanguageService.js';

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

type ChapterAssessmentTarget = { label: string; storageSubject: string; chapters: string[] };

function resolveChapterAssessmentTarget(text: string): ChapterAssessmentTarget | null {
  const value = text.toLowerCase();
  const taxonomy = INTERMEDIATE_CHAPTERS['Taxation (Income Tax & GST)'] || [];
  const combinedFs = INTERMEDIATE_CHAPTERS['Financial Management and Strategic Management'] || [];
  const accounting = INTERMEDIATE_CHAPTERS['Advanced Accounting'] || [];
  const laws = INTERMEDIATE_CHAPTERS['Corporate and Other Laws'] || [];
  const costing = INTERMEDIATE_CHAPTERS['Cost and Management Accounting'] || [];
  const audit = INTERMEDIATE_CHAPTERS['Auditing and Ethics'] || [];

  if (/\b(income tax\s*(?:and|&)\s*gst|taxation\s*\(\s*income tax\s*(?:and|&)\s*gst\s*\))\b/i.test(value)) {
    return { label: 'Taxation', storageSubject: 'Taxation (Income Tax & GST)', chapters: taxonomy };
  }
  if (/\b(gst|goods and services tax)\b/i.test(value)) {
    return { label: 'GST', storageSubject: 'Taxation (Income Tax & GST)', chapters: taxonomy.filter((chapter) => chapter.startsWith('GST:')) };
  }
  if (/\b(income tax|direct tax|income-tax)\b/i.test(value)) {
    return { label: 'Income Tax', storageSubject: 'Taxation (Income Tax & GST)', chapters: taxonomy.filter((chapter) => !chapter.startsWith('GST:')) };
  }
  if (/\b(fm\s*(?:and|&)\s*sm|financial management and strategic management|fm and sm|both fm and sm)\b/i.test(value)) {
    return { label: 'FM and SM', storageSubject: 'Financial Management and Strategic Management', chapters: combinedFs };
  }
  if (/\b(financial management|\bfm\b)\b/i.test(value)) {
    return { label: 'FM', storageSubject: 'Financial Management and Strategic Management', chapters: combinedFs.slice(0, 9) };
  }
  if (/\b(strategic management|\bsm\b)\b/i.test(value)) {
    return { label: 'SM', storageSubject: 'Financial Management and Strategic Management', chapters: combinedFs.slice(9) };
  }
  if (/\b(taxation|tax paper|income tax and gst|income tax & gst)\b/i.test(value)) {
    return { label: 'Taxation', storageSubject: 'Taxation (Income Tax & GST)', chapters: taxonomy };
  }
  if (/\b(advanced accounting|accounts|accounting)\b/i.test(value)) {
    return { label: 'Advanced Accounting', storageSubject: 'Advanced Accounting', chapters: accounting };
  }
  if (/\b(corporate and other laws|corporate law|company law|law|laws)\b/i.test(value)) {
    return { label: 'Corporate and Other Laws', storageSubject: 'Corporate and Other Laws', chapters: laws };
  }
  if (/\b(costing|cost and management accounting|cost accounting)\b/i.test(value)) {
    return { label: 'Cost and Management Accounting', storageSubject: 'Cost and Management Accounting', chapters: costing };
  }
  if (/\b(audit|auditing|ethics)\b/i.test(value)) {
    return { label: 'Auditing and Ethics', storageSubject: 'Auditing and Ethics', chapters: audit };
  }
  return null;
}

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
  const examDate = typeof body.exam_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.exam_date)
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

router.post('/multi-day-schedule', authenticateToken, (req: AuthRequest, res: Response) => {
  if (!req.user || String(req.user.role).toUpperCase() !== 'STUDENT') {
    return res.status(403).json({ success: false, error: 'Student account required.' });
  }
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const course = String(body.course || 'CA_INTERMEDIATE').toUpperCase();
  if (course !== 'CA_INTERMEDIATE') {
    return res.status(400).json({ success: false, error: 'Multi-day schedules are currently available for CA Intermediate only.' });
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
    const plan = createMultiDayStudyPlan({
      start_date: typeof body.start_date === 'string' ? body.start_date : new Date().toISOString().slice(0, 10),
      daily_study_hours: Number(body.daily_study_hours),
      study_start_time: String(body.study_start_time || ''),
      preferred_end_time: String(body.preferred_end_time || ''),
      attempt: String(body.attempt || ''),
      exact_exam_date: typeof body.exact_exam_date === 'string' && body.exact_exam_date ? body.exact_exam_date : null,
      class_mode: body.class_mode === 'fixed' || body.class_mode === 'flexible' ? body.class_mode : 'none',
      class_blocks: Array.isArray(body.class_blocks) ? body.class_blocks : [],
      priorities,
    });
    return res.json({ success: true, course, plan });
  } catch (error) {
    return res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Could not create the multi-day study plan.' });
  }
});

router.post('/attempt-roadmap', authenticateToken, (req: AuthRequest, res: Response) => {
  if (!req.user || String(req.user.role).toUpperCase() !== 'STUDENT') {
    return res.status(403).json({ success: false, error: 'Student account required.' });
  }
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const course = String(body.course || 'CA_INTERMEDIATE').toUpperCase();
  if (course !== 'CA_INTERMEDIATE') return res.status(400).json({ success: false, error: 'Attempt roadmaps are currently available for CA Intermediate only.' });
  try {
    const startDate = String(body.start_date || '');
    const examDate = String(body.exact_exam_date || '');
    const roadmap = createAttemptStudyPhases({
      start_date: startDate,
      exact_exam_date: examDate,
      syllabus_completion_percent: body.syllabus_completion_percent === undefined ? 0 : Number(body.syllabus_completion_percent),
    });
    const chapterRows = db.prepare(
      'SELECT subject, chapter, strength FROM student_chapter_strengths WHERE user_id = ? AND course = ? AND chapter != ?'
    ).all(req.user.id, course, '__SUBJECT_LEVEL__') as Array<{ subject: string; chapter: string; strength: string }>;
    const revisionRounds = createAdaptiveRevisionRounds({
      start_date: startDate,
      exact_exam_date: examDate,
      daily_study_hours: Number(body.daily_study_hours || 4),
      chapters: chapterRows,
    });
    return res.json({ success: true, course, roadmap, revision_rounds: revisionRounds, chapter_ratings_used: chapterRows.length });
  } catch (error) {
    return res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Could not create attempt roadmap.' });
  }
});

router.get('/revision-progress', authenticateToken, (req: AuthRequest, res: Response) => {
  if (!req.user || String(req.user.role).toUpperCase() !== 'STUDENT') {
    return res.status(403).json({ success: false, error: 'Student account required.' });
  }
  const course = String(req.query.course || 'CA_INTERMEDIATE').toUpperCase();
  const examDate = String(req.query.exam_date || '');
  if (course !== 'CA_INTERMEDIATE' || !/^\d{4}-\d{2}-\d{2}$/.test(examDate) ||
      Number.isNaN(new Date(examDate + 'T00:00:00.000Z').getTime()) ||
      new Date(examDate + 'T00:00:00.000Z').toISOString().slice(0, 10) !== examDate) {
    return res.status(400).json({ success: false, error: 'A valid CA Intermediate exam date is required.' });
  }
  const progress = db.prepare(
    'SELECT round_key, subject, chapter, completed, completed_at, updated_at FROM student_revision_round_progress WHERE user_id = ? AND course = ? AND exam_date = ?'
  ).all(req.user.id, course, examDate);
  return res.json({ success: true, progress });
});

router.put('/revision-progress', authenticateToken, (req: AuthRequest, res: Response) => {
  if (!req.user || String(req.user.role).toUpperCase() !== 'STUDENT') {
    return res.status(403).json({ success: false, error: 'Student account required.' });
  }
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const course = String(body.course || '').toUpperCase();
  const examDate = typeof body.exam_date === 'string' ? body.exam_date : '';
  const roundKey = String(body.round_key || '').toUpperCase();
  const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
  const chapter = typeof body.chapter === 'string' ? body.chapter.trim() : '';
  if (course !== 'CA_INTERMEDIATE' || !/^\d{4}-\d{2}-\d{2}$/.test(examDate) ||
      Number.isNaN(new Date(examDate + 'T00:00:00.000Z').getTime()) ||
      new Date(examDate + 'T00:00:00.000Z').toISOString().slice(0, 10) !== examDate ||
      !['R1', 'R2', 'R3', 'R4'].includes(roundKey) || !subject || subject.length > 160 ||
      !chapter || chapter.length > 200 || typeof body.completed !== 'boolean') {
    return res.status(400).json({ success: false, error: 'Provide a valid round, exam date, subject, chapter and completion state.' });
  }
  const completed = body.completed ? 1 : 0;
  const id = randomUUID();
  db.prepare(`
    INSERT INTO student_revision_round_progress (id, user_id, course, exam_date, round_key, subject, chapter, completed, completed_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE NULL END, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id, course, exam_date, round_key, subject, chapter)
    DO UPDATE SET completed = excluded.completed, completed_at = CASE WHEN excluded.completed = 1 THEN CURRENT_TIMESTAMP ELSE NULL END, updated_at = CURRENT_TIMESTAMP
  `).run(id, req.user.id, course, examDate, roundKey, subject, chapter, completed, completed);
  return res.json({ success: true, round_key: roundKey, subject, chapter, completed: Boolean(completed) });
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
    ? (INTERMEDIATE_CHAPTERS[allowedSubject.name]
      || [...(allowedSubject.keyProvisions || []), ...(allowedSubject.accountingStandards || [])])
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
  if (!Number.isInteger(total) || total < 1 || total > 10080 || sum !== total || plan.sessions.some((s: any) => !s || typeof s.subject !== 'string' || typeof s.label !== 'string' || !Number.isInteger(s.minutes) || s.minutes < 1)) {
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
  const studiedOn = typeof body.studied_on === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.studied_on) ? body.studied_on : new Date().toISOString().slice(0, 10);
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

    const history = Array.isArray(body.conversation_history)
      ? body.conversation_history.filter((item: unknown): item is string => typeof item === 'string').slice(-6)
      : [];

    // Any supported CA Intermediate subject can request an explicit chapter assessment.
    // A focused request (GST, Income Tax, FM or SM) uses only that component; a combined
    // subject request uses the full combined chapter registry.
    const conversationText = [message, ...history].join(' ');
    const assessmentTarget = resolveChapterAssessmentTarget(message) || resolveChapterAssessmentTarget(conversationText);
    const assessmentRequest = Boolean(assessmentTarget)
      && /\b(revision|revise|study|plan|prepare|preparation|detailed|effective|repeat|round|practice)\b/i.test(conversationText);

    if (assessmentRequest && assessmentTarget && !Array.isArray(body.chapter_ratings)) {
      return res.json({
        success: true,
        status: 'needs_chapter_assessment',
        message: 'Bhai, ' + assessmentTarget.label + ' ke liye pehle har listed chapter ki strength select kar. Main ratings guess nahi karunga. Available revision time bhi choose kar; phir chapter-wise plan bana dunga.',
        parsed: { intent: 'clarify', course, subjects: [assessmentTarget.label], duration_minutes: null, focus_text: assessmentTarget.label + ' chapter-wise revision', date_text: null, schedule_mode: 'one_time', class_time_text: null, performance_data: [], missing_info: [assessmentTarget.label + ' chapter strengths', 'available study time'], should_call_planner: false },
        plan: null,
        chapter_assessment: { subject: assessmentTarget.label, storage_subject: assessmentTarget.storageSubject, chapters: assessmentTarget.chapters },
        metadata: { version: 'planner-chapter-assessment-v2', modelUsed: false, persistentStorage: true },
      });
    }

    if (assessmentRequest && assessmentTarget && Array.isArray(body.chapter_ratings)) {
      const submitted = body.chapter_ratings as Array<{ chapter?: unknown; strength?: unknown }>;
      const allowed = new Set(assessmentTarget.chapters);
      const ratings = submitted.map((item) => ({
        chapter: typeof item?.chapter === 'string' ? item.chapter : '',
        strength: typeof item?.strength === 'string' ? item.strength.toUpperCase() : '',
      }));
      const minutes = Number(body.available_minutes);
      if (String(body.chapter_assessment_subject || '') !== assessmentTarget.label
        || ratings.length !== assessmentTarget.chapters.length
        || ratings.some((item) => !allowed.has(item.chapter) || !ALLOWED_STRENGTHS.has(item.strength))
        || new Set(ratings.map((item) => item.chapter)).size !== assessmentTarget.chapters.length
        || !Number.isInteger(minutes) || minutes < 30 || minutes > 720 || minutes % 15 !== 0) {
        return res.status(400).json({ success: false, error: 'Rate every ' + assessmentTarget.label + ' chapter as Weak, Moderate, or Strong and choose 30–720 minutes in 15-minute increments.' });
      }

      const saveStrength = db.prepare(`
        INSERT INTO student_chapter_strengths (id, user_id, course, subject, chapter, strength, updated_at)
        VALUES (?, ?, 'CA_INTERMEDIATE', ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id, course, subject, chapter)
        DO UPDATE SET strength = excluded.strength, updated_at = CURRENT_TIMESTAMP
      `);
      const persistRatings = db.transaction(() => {
        for (const item of ratings) saveStrength.run(randomUUID(), req.user!.id, assessmentTarget.storageSubject, item.chapter, item.strength);
      });
      persistRatings();

      const weights = ratings.map((item) => item.strength === 'WEAK' ? 1.6 : item.strength === 'MODERATE' ? 1 : 0.6);
      const allocations = ratings.map(() => 1);
      let remaining = minutes - allocations.length;
      const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
      const fractional = weights.map((weight, index) => ({ index, raw: remaining * weight / totalWeight }));
      for (const item of fractional) allocations[item.index] += Math.floor(item.raw);
      let leftover = minutes - allocations.reduce((sum, value) => sum + value, 0);
      fractional.sort((a, b) => (b.raw - Math.floor(b.raw)) - (a.raw - Math.floor(a.raw)));
      for (let i = 0; leftover > 0; i++, leftover--) allocations[fractional[i % fractional.length].index] += 1;

      const sessions = ratings.map((item, index) => ({
        order: index + 1,
        subject: assessmentTarget.label,
        label: item.strength === 'WEAK' ? 'Concept revision + extra practice' : item.strength === 'MODERATE' ? 'Revision + question practice' : 'Quick recall + self-test',
        minutes: allocations[index],
        instruction: item.chapter.replace(/^(GST|Income Tax|FM|SM):\s*/i, '') + ' — ' + item.strength.toLowerCase() + ' chapter. ' + (item.strength === 'WEAK' ? 'Review concepts and provisions/formulas, then solve worked examples and exam-style questions.' : item.strength === 'MODERATE' ? 'Revise key rules and solve representative questions, then check mistakes.' : 'Use active recall, revise key exceptions/formulas and solve a short timed set.'),
        chapter: item.chapter,
        strength: item.strength,
      }));
      const plan = {
        title: assessmentTarget.label + ' detailed revision plan',
        total_minutes: minutes,
        subjects: [assessmentTarget.label],
        sessions,
        saved: false as const,
        note: 'Chapter strengths saved to your planner. Weak chapters receive more time; save this plan to track progress.',
      };
      return res.json({
        success: true,
        status: 'plan_draft_ready',
        message: 'Bhai, ' + assessmentTarget.label + ' ka chapter-wise revision plan ready hai. Weak chapters ko zyada time diya hai, aur ratings tumhare planner profile mein save ho gayi hain.',
        parsed: { intent: 'create_study_plan', course, subjects: [assessmentTarget.label], duration_minutes: minutes, focus_text: assessmentTarget.label + ' chapter-wise detailed revision', date_text: null, schedule_mode: 'one_time', class_time_text: null, performance_data: [], missing_info: [], should_call_planner: true },
        plan,
        metadata: { version: 'planner-chapter-revision-v2', modelUsed: false, persistentStorage: true },
      });
    }

    // Resolve follow-ups about units/duration from the most recent structured draft.
    // The UI may send the prior draft even if a later assistant reply was only a clarification.
    const previousPlan = body.previous_plan && typeof body.previous_plan === 'object'
      ? body.previous_plan as { title?: unknown; total_minutes?: unknown; subjects?: unknown; sessions?: unknown }
      : null;
    const asksDurationConversion = /\b(hour|hours|hrs|minute|minutes|min|mins)\b/i.test(message)
      && /\b(kitne|how many|convert|minutes? ke jagah|hours? me|hours? mein|time diya|duration|total time)\b/i.test(message);
    if (previousPlan && asksDurationConversion && Number.isFinite(Number(previousPlan.total_minutes)) && Number(previousPlan.total_minutes) > 0) {
      const totalMinutes = Math.round(Number(previousPlan.total_minutes));
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      const subjects = Array.isArray(previousPlan.subjects)
        ? previousPlan.subjects.filter((item: unknown): item is string => typeof item === 'string').slice(0, 4)
        : [];
      const sessions = Array.isArray(previousPlan.sessions)
        ? previousPlan.sessions.filter((item: any) => item && typeof item === 'object' && Number.isFinite(Number(item.minutes)) && typeof item.label === 'string').slice(0, 8)
        : [];
      const durationText = hours ? hours + ' hour' + (hours === 1 ? '' : 's') + (minutes ? ' ' + minutes + ' minutes' : '') : totalMinutes + ' minutes';
      const sessionText = sessions.map((item: any) => {
        const m = Math.round(Number(item.minutes));
        const h = Math.floor(m / 60);
        const rem = m % 60;
        const label = String(item.label);
        const duration = h ? h + 'h' + (rem ? ' ' + rem + 'm' : '') : rem + 'm';
        return label + ': ' + duration;
      }).join('; ');
      const subjectText = subjects.length ? subjects.join(' / ') : 'your study';
      const reply = 'Bhai, tumhara ' + subjectText + ' plan total ' + durationText + ' ka tha (' + totalMinutes + ' minutes).' + (sessionText ? ' Breakdown: ' + sessionText + '.' : '');
      return res.json({
        success: true,
        status: 'plan_followup_answered',
        message: reply,
        parsed: { intent: 'general_guidance', course: course || null, subjects, duration_minutes: totalMinutes, focus_text: 'Explain the duration of the previous study-plan draft.', date_text: null, schedule_mode: 'follow_up', class_time_text: null, performance_data: [], missing_info: [], should_call_planner: false },
        plan: null,
        metadata: { version: 'planner-followup-context-v1', modelUsed: false, persistentStorage: false },
      });
    }

    const parsed = parseStudyPlannerConversationRequest(message, history, course || null);
    const replyLanguage = detectStudyReplyLanguage(message);
    // A study question should receive an answer, not be forced through the timetable form.
    if (parsed.intent === 'clarify' && isGeneralStudyQuestion(message)) {
      parsed.intent = 'general_guidance';
      parsed.missing_info = [];
      parsed.should_call_planner = false;
    }
    const usedDefaultDuration = applyDefaultStudyDuration(parsed, body.default_duration_minutes);
    const plan = createStudyPlanDraft(parsed);

    let status = 'request_parsed';
    let responseMessage = 'Request parsed. This beta does not save class changes, study progress, or chapter priorities.';

    if (parsed.intent === 'out_of_scope') {
      status = 'unsupported_course';
      responseMessage = 'CA Final is not supported by this planner beta yet. Your request was not executed.';
    } else if (parsed.intent === 'clarify') {
      status = 'needs_clarification';
      if (parsed.missing_info.includes('available study time') && parsed.subjects.length > 0) {
        responseMessage = replyLanguage === 'hinglish'
          ? 'Bhai, ' + parsed.subjects.join(' aur ') + ' ke liye roz kitne ghante de sakte ho? Main usi ke hisaab se plan bana dunga.'
          : replyLanguage === 'hindi'
            ? 'तुम ' + parsed.subjects.join(' और ') + ' के लिए रोज़ कितने घंटे दे सकते हो? मैं उसी हिसाब से plan बना दूँगा।'
            : 'How much time can you study each day for ' + parsed.subjects.join(' and ') + '? I’ll build the plan around that.';
      } else if (parsed.missing_info.includes('subject or study goal')) {
        responseMessage = replyLanguage === 'hinglish'
          ? 'Bhai, kis subject ya topic par help chahiye? Main explanation, revision strategy ya timetable mein help kar sakta hoon.'
          : replyLanguage === 'hindi'
            ? 'किस subject या topic पर मदद चाहिए? मैं concept समझाने, revision strategy या timetable में मदद कर सकता हूँ।'
            : 'Which subject or topic do you need help with? I can explain concepts, suggest revision strategies, or build a timetable.';
      } else if (parsed.missing_info.length > 0) {
        responseMessage = replyLanguage === 'hinglish'
          ? 'Bhai, bas ye detail bata de: ' + parsed.missing_info.join(', ') + '.'
          : replyLanguage === 'hindi'
            ? 'कृपया यह detail बता दें: ' + parsed.missing_info.join(', ') + '।'
            : 'Please provide this detail: ' + parsed.missing_info.join(', ') + '.';
      } else {
        responseMessage = replyLanguage === 'hinglish'
          ? 'Bhai, apna subject/topic bata de, main help karta hoon.'
          : replyLanguage === 'hindi'
            ? 'अपना subject/topic बताइए, मैं मदद करता हूँ।'
            : 'Please share your subject or topic so I can help.';
      }
    } else if (parsed.intent === 'create_study_plan' && plan) {
      status = 'plan_draft_ready';
      responseMessage = replyLanguage === 'hinglish'
        ? 'Bhai, ' + parsed.subjects.join(' aur ') + ' ka ' + (parsed.duration_minutes || 0) + ' minute ka revision draft ready hai' + (usedDefaultDuration ? ' — tumhari daily study-hours setting ke basis par.' : '.') + ' Ye abhi draft hai; account/calendar mein save nahi hua.'
        : replyLanguage === 'hindi'
          ? parsed.subjects.join(' और ') + ' का ' + (parsed.duration_minutes || 0) + ' मिनट का revision draft तैयार है। यह अभी account/calendar में save नहीं हुआ है।'
          : 'Your study-plan draft is ready. It has not been saved to your account or calendar.';
    } else if (parsed.intent === 'general_guidance') {
      responseMessage = buildGeneralStudyAnswer(message, parsed).answer;
    } else if (parsed.intent === 'prioritize_chapters') {
      responseMessage = replyLanguage === 'hinglish'
        ? 'Bhai, pehle weak chapters ko priority de. Har chapter ke liye mock score, confidence aur pending questions compare kar; phir weak chapters par concept revision + timed practice kar. Main abhi sirf is chat se ranking calculate/save nahi kar raha—chapter ratings ya mock marks add karoge toh planner unhe use kar sakta hai.'
        : replyLanguage === 'hindi'
          ? 'पहले weak chapters को priority दें। हर chapter के mock score, confidence और pending questions compare करें; फिर weak chapters पर concept revision और timed practice करें। इस chat से ranking अपने-आप save नहीं हुई है।'
          : 'Prioritise weak chapters first. Compare mock scores, confidence and pending questions, then use concept revision plus timed practice for weak areas. This chat has not saved a ranking; add chapter ratings or mock marks for the planner to use.';
    } else if (parsed.intent === 'update_class_schedule') {
      responseMessage = replyLanguage === 'hinglish'
        ? 'Class timing request samajh aayi, bhai. Is chat se schedule save nahi hua; weekly class schedule section mein timings add karke save/plan generate karo.'
        : replyLanguage === 'hindi'
          ? 'Class timing request समझ आ गई। इस chat से schedule save नहीं हुआ; weekly class schedule section में timings add करें।'
          : 'I understood the class timing request. It was not saved from this chat; add the timings in the weekly class schedule section.';
    } else if (parsed.intent === 'log_study_progress') {
      responseMessage = replyLanguage === 'hinglish'
        ? 'Progress note samajh aa gaya, bhai, lekin is chat se progress entry save nahi hui. Study progress section mein session log karo.'
        : replyLanguage === 'hindi'
          ? 'Progress note समझ आ गया, लेकिन इस chat से entry save नहीं हुई। Study progress section में session log करें।'
          : 'I understood the progress note, but it was not saved from this chat. Log the session in Study Progress.';
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
