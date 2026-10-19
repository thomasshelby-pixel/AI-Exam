import { Router, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { db } from '../db.js';
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
import { buildChapterAssessmentPrompt, buildChapterAssessmentReadyMessage, buildGeneralStudyAnswer, buildIntermediateSMClarification, buildPlanScopeOptions, detectStudyReplyLanguage, isGeneralStudyQuestion } from '../services/studyPlannerLanguageService.js';
import { resolveChapterAssessmentTarget } from '../services/studyPlannerChapterAssessment.js';
import { getCourseUnderDevelopmentReply, resolveBareTopicClarification, shouldPrioritizeChapterAssessment } from '../services/studyPlannerChatPolicy.js';
import { getPlannerSubjects, getPlannerSubjectAliases, isSupportedPlannerCourse, isValidPlannerSubject, isValidPlannerChapter, type PlannerCourse } from '../services/studyPlannerCurriculum.js';

const router = Router();
const MAX_MESSAGE_LENGTH = 1200;

const ALLOWED_STRENGTHS = new Set(['STRONG', 'MODERATE', 'WEAK']);

function getStudentPlannerCourse(userId: string): 'CA_FOUNDATION' | 'CA_INTERMEDIATE' | 'CA_FINAL' | null {
  const profile = db.prepare('SELECT ca_level FROM student_profiles WHERE user_id = ?').get(userId) as { ca_level?: string } | undefined;
  const level = String(profile?.ca_level || '').trim().toUpperCase().replace(/^CA[ _-]*/, '').replace(/[ -]+/g, '_');
  if (level === 'FOUNDATION' || level === 'FOUND') return 'CA_FOUNDATION';
  if (level === 'INTERMEDIATE' || level === 'INTER') return 'CA_INTERMEDIATE';
  if (level === 'FINAL') return 'CA_FINAL';
  return null;
}

function isOneDayPlanChoice(text: string): boolean {
  return /\b(one[- ]day|single day|just one day|only today|today only|tomorrow only|today|tomorrow|sirf ek din|bas ek din|aaj ke liye|kal ke liye)\b/i.test(text);
}
function isMultiDayPlanChoice(text: string): boolean {
  return /\b(daily|weekly|day[- ]wise|daywise|next 7 days|next seven days|multi[- ]day|every day|each day|till (?:the )?exam|until (?:the )?exam|through (?:the )?exam|exam roadmap|har din|roz|poore hafte|pure hafte|exam tak)\b/i.test(text);
}
function isExamRoadmapChoice(text: string): boolean {
  return /\b(?:full exam roadmap|exam roadmap|till (?:the )?exam|until (?:the )?exam|through (?:the )?exam|weekly timetable until exam|exam tak roadmap|exam tak weekly)\b/i.test(text);
}
function isExplicitStudyPlanRequest(text: string): boolean {
  const value = text.trim();
  return /^(?:please\s+)?(?:make|create|build|generate|prepare|draft|plan|schedule|set up|banao|bana do|bana de|bna do|bna de)\b/i.test(value)
    || /\b(?:i need|i want|give me|can you make|please make|mujhe|mere liye)\b.{0,80}\b(?:plan|planner|timetable|schedule|routine)\b/i.test(value)
    || /\b(?:detailed|full|chapter-wise)\s+revision\b/i.test(value)
    || /\b(?:daily|weekly|day[- ]wise|daywise)\s+(?:study\s+)?(?:plan|timetable|schedule|routine)\b/i.test(value);
}

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

function resolveCourseAssessmentTarget(text: string, course: PlannerCourse | 'CA_FINAL') {
  if (course === 'CA_FINAL') return null;
  if (course === 'CA_INTERMEDIATE') return resolveChapterAssessmentTarget(text, INTERMEDIATE_CHAPTERS);
  const value = String(text || '').toLowerCase();
  const aliases: Record<string, string[]> = {
    'Accounting': ['accounting', 'accounts'],
    'Business Laws': ['business laws', 'business law', 'law'],
    'Quantitative Aptitude': ['quantitative aptitude', 'quantitative', 'logical reasoning', 'statistics', 'business mathematics', 'qa'],
    'Business Economics': ['business economics', 'economics'],
  };
  const options = getPlannerSubjects('CA_FOUNDATION')
    .sort((a, b) => b.name.length - a.name.length);
  const match = options.find((subject) => [subject.name, ...(aliases[subject.name] || [])]
    .some((label) => label.toLowerCase() === 'qa' ? /\\bqa\\b/i.test(value) : value.includes(label.toLowerCase())));
  if (!match) return null;
  return { label: match.name, storageSubject: match.name, chapters: match.chapters };
}

function getCanonicalStrengthSubject(subject: string, course: PlannerCourse): string[] {
  return getPlannerSubjectAliases(subject, course);
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
  const validSubject = isSupportedPlannerCourse(course) && (isValidPlannerSubject(course, subject) || (course === 'CA_INTERMEDIATE' && ['Taxation', 'Costing', 'Law', 'Audit', 'FM and SM'].includes(subject)));
  if (!isSupportedPlannerCourse(course) || !validSubject || !Number.isFinite(score) || !Number.isFinite(maxScore) || maxScore <= 0 || score < 0 || score > maxScore || maxScore > 1000 || !['SELF_REPORTED', 'MOCK_TEST', 'PAST_PAPER'].includes(source)) {
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
  if (!isSupportedPlannerCourse(course)) {
    return res.status(400).json({ success: false, error: 'Adaptive priorities are available for CA Foundation and CA Intermediate only.' });
  }
  const strengths = db.prepare('SELECT subject, chapter, strength, updated_at FROM student_chapter_strengths WHERE user_id = ? AND course = ? AND chapter != ?')
    .all(req.user.id, course, '__SUBJECT_LEVEL__') as Array<{ subject: string; chapter: string; strength: string; updated_at: string }>;
  const results = db.prepare('SELECT subject, score, max_score, exam_date, source FROM student_mock_results WHERE user_id = ? AND course = ? ORDER BY exam_date DESC, created_at DESC LIMIT 200')
    .all(req.user.id, course) as Array<{ subject: string; score: number; max_score: number; exam_date: string; source: string }>;
  const latestBySubject = new Map<string, { subject: string; score: number; max_score: number; exam_date: string; source: string }>();
  for (const result of results) {
    if (!latestBySubject.has(result.subject)) latestBySubject.set(result.subject, result);
  }
  const subjects = getPlannerSubjects(course);
  const priorities = strengths.map((item) => {
    const aliases = getCanonicalStrengthSubject(item.subject, course);
    const matchingSubject = subjects.find((subject) => aliases.includes(subject.name));
    const canonicalNames = new Set([item.subject, matchingSubject?.name || '', ...aliases]);
    const mock = [...latestBySubject.values()].find((result) => canonicalNames.has(result.subject) || getCanonicalStrengthSubject(result.subject, course).some((alias) => canonicalNames.has(alias)));
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
  if (!isSupportedPlannerCourse(course)) {
    return res.status(400).json({ success: false, error: 'Daily schedules are available for CA Foundation and CA Intermediate only.' });
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
    const aliases = getCanonicalStrengthSubject(item.subject, course);
    const matchingSubject = getPlannerSubjects(course).find((subject) => aliases.includes(subject.name));
    const canonicalNames = new Set([item.subject, matchingSubject?.name || '', ...aliases]);
    const mock = [...latestBySubject.values()].find((result) =>
      canonicalNames.has(result.subject) || getCanonicalStrengthSubject(result.subject, course).some((alias) => canonicalNames.has(alias))
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
  if (!isSupportedPlannerCourse(course)) {
    return res.status(400).json({ success: false, error: 'Multi-day schedules are available for CA Foundation and CA Intermediate only.' });
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
    const aliases = getCanonicalStrengthSubject(item.subject, course);
    const matchingSubject = getPlannerSubjects(course).find((subject) => aliases.includes(subject.name));
    const canonicalNames = new Set([item.subject, matchingSubject?.name || '', ...aliases]);
    const mock = [...latestBySubject.values()].find((result) =>
      canonicalNames.has(result.subject) || getCanonicalStrengthSubject(result.subject, course).some((alias) => canonicalNames.has(alias))
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
  if (!isSupportedPlannerCourse(course)) return res.status(400).json({ success: false, error: 'Attempt roadmaps are available for CA Foundation and CA Intermediate only.' });
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
  if (!isSupportedPlannerCourse(course) || !/^\d{4}-\d{2}-\d{2}$/.test(examDate) ||
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
  if (!isSupportedPlannerCourse(course) || !/^\d{4}-\d{2}-\d{2}$/.test(examDate) ||
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
  if (!isSupportedPlannerCourse(course)) {
    return res.status(400).json({ success: false, error: 'Chapter-level assessment is available for CA Foundation and CA Intermediate only.' });
  }
  return res.json({ success: true, course, source: 'CA_CURRICULUM', subjects: getPlannerSubjects(course) });
});

router.get('/profile', authenticateToken, (req: AuthRequest, res: Response) => {
  if (!req.user || String(req.user.role).toUpperCase() !== 'STUDENT') {
    return res.status(403).json({ success: false, error: 'Student account required.' });
  }
  const course = String(req.query.course || 'CA_INTERMEDIATE').toUpperCase();
  if (!['CA_FOUNDATION', 'CA_INTERMEDIATE', 'CA_FINAL'].includes(course)) {
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
  const allowedSubject = isSupportedPlannerCourse(course) && isValidPlannerSubject(course, subject);
  const validChapter = isSupportedPlannerCourse(course) && isValidPlannerChapter(course, subject, chapter);
  if (
    !isSupportedPlannerCourse(course)
    || !allowedSubject
    || subject.length > 160
    || !chapter
    || chapter.length > 200
    || !validChapter
    || !ALLOWED_STRENGTHS.has(strength)
  ) {
    return res.status(400).json({ success: false, error: 'Choose a subject and chapter from the supported CA Foundation or CA Intermediate curriculum.' });
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
  if (!['CA_FOUNDATION', 'CA_INTERMEDIATE', 'CA_FINAL'].includes(course) || !plan || typeof plan !== 'object' || !Array.isArray(plan.sessions) || plan.sessions.length < 1 || plan.sessions.length > 100) {
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
  if (!['CA_FOUNDATION', 'CA_INTERMEDIATE', 'CA_FINAL'].includes(course) || !subject || subject.length > 160 || !activity || activity.length > 120 || !Number.isInteger(duration) || duration < 1 || duration > 1440) {
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

router.get('/course', authenticateToken, (req: AuthRequest, res: Response) => {
  if (!req.user || String(req.user.role).toUpperCase() !== 'STUDENT') return res.status(403).json({ success: false, error: 'Student account required.' });
  const course = getStudentPlannerCourse(req.user.id);
  if (!course) return res.status(400).json({ success: false, error: 'Your CA course is missing from your student profile. Please update your profile.' });
  const labels = { CA_FOUNDATION: 'CA Foundation', CA_INTERMEDIATE: 'CA Intermediate', CA_FINAL: 'CA Final' };
  return res.json({ success: true, course, label: labels[course], supportsChapterPlanner: isSupportedPlannerCourse(course) });
});

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

    // Course is authoritative from the authenticated student's saved profile.
    // Never trust a client-supplied course: this prevents students being routed to
    // a planner that is not available for their registered CA level.
    const course = getStudentPlannerCourse(req.user.id) || '';

    if (!course) {
      return res.status(400).json({
        success: false,
        status: 'profile_course_missing',
        error: 'Your CA course is missing from your student profile. Please update your profile before using AI Planner.',
      });
    }

    // CA Final chat is intentionally unavailable for now: answer consistently before
    // subject parsing or clarification, so it never asks Final students for missing details.
    const courseUnderDevelopmentReply = getCourseUnderDevelopmentReply(course);
    if (courseUnderDevelopmentReply) {
      return res.json({
        success: true,
        status: 'course_under_development',
        message: courseUnderDevelopmentReply,
        parsed: {
          intent: 'out_of_scope', course, subjects: [], duration_minutes: null, focus_text: '',
          date_text: null, schedule_mode: 'none', class_time_text: null, performance_data: [],
          missing_info: [], should_call_planner: false,
        },
        plan: null,
        metadata: { version: 'planner-course-availability-v1', modelUsed: false, persistentStorage: false },
      });
    }

    const history = Array.isArray(body.conversation_history)
      ? body.conversation_history.filter((item: unknown): item is string => typeof item === 'string').slice(-6)
      : [];

    // Normalize common Hinglish concatenation before both intent and chapter matching.
    const normalizedMessage = message.replace(/\bmain(?=gst\b)/i, 'main ');
    const conversationText = [normalizedMessage, ...history].join(' ');
    const requestedReplyLanguage = body.reply_language;
    const replyLanguage = requestedReplyLanguage === 'english' || requestedReplyLanguage === 'hinglish' || requestedReplyLanguage === 'hindi'
      ? requestedReplyLanguage
      : detectStudyReplyLanguage(message);
    const parsedProbe = parseStudyPlannerConversationRequest(normalizedMessage, history, course);

    // Explain unsupported course abbreviations instead of implying the student never
    // supplied a subject. “SM” belongs to the CA Intermediate FM-SM context, not CA Final.
    const topicClarification = resolveBareTopicClarification(course, normalizedMessage);
    if (topicClarification === 'FINAL_SM_MISMATCH') {
      parsedProbe.intent = 'clarify';
      parsedProbe.subjects = [];
      parsedProbe.missing_info = ['confirm your CA course or choose a CA Final subject'];
      parsedProbe.should_call_planner = false;
      return res.json({
        success: true,
        status: 'course_topic_mismatch',
        message: 'Your planner profile is set to CA Final, so “SM” is not being recognised as one of its current planner subjects. If you meant CA Intermediate Strategic Management (FM-SM), update your CA level in your student profile to CA Intermediate; the planner follows your saved profile course. Otherwise, enter the CA Final subject or chapter you want to study.',
        parsed: parsedProbe,
        plan: null,
        metadata: { version: 'planner-course-topic-clarity-v1', modelUsed: false, persistentStorage: false },
      });
    }
    if (topicClarification === 'INTERMEDIATE_SM') {
      parsedProbe.intent = 'general_guidance';
      parsedProbe.subjects = ['Financial Management and Strategic Management'];
      parsedProbe.missing_info = [];
      parsedProbe.should_call_planner = false;
      return res.json({
        success: true,
        status: 'topic_clarification',
        message: buildIntermediateSMClarification(replyLanguage),
        parsed: parsedProbe,
        plan: null,
        follow_up_options: ['SM effective revision strategy', 'Explain an SM concept', 'SM study plan'],
        metadata: { version: 'planner-topic-clarification-v1', modelUsed: false, persistentStorage: false },
      });
    }

    // Answer ordinary study questions directly. Do not force advice requests into a timetable form.
    const guidanceQuestion = isGeneralStudyQuestion(message) && !isExplicitStudyPlanRequest(message)
      && !/\b(?:detailed|full|chapter-wise)\s+revision\b/i.test(message);
    if (guidanceQuestion) {
      const parsed = parsedProbe;
      parsed.intent = 'general_guidance';
      parsed.missing_info = [];
      parsed.should_call_planner = false;
      if (course === 'CA_INTERMEDIATE' && /\b(?:gst|goods and services tax|maingst)\b/i.test(message)) {
        parsed.subjects = ['GST'];
      }
      const guidance = buildGeneralStudyAnswer(message, parsed);
      return res.json({
        success: true, status: 'general_guidance_answered', message: guidance.answer, parsed, plan: null,
        metadata: { version: 'study-chat-guidance-v2', modelUsed: false, persistentStorage: false },
      });
    }

    const explicitPlan = isExplicitStudyPlanRequest(message)
      || /\b(?:detailed|full|chapter-wise)\s+revision\b/i.test(message);
    const priorScopeQuestion = history.some((item) => /choose.*(?:one day|daily|weekly)|what type of plan|which plan would you like|one-day revision plan|exam roadmap.*weekly timetable|sirf ek din|daily\/weekly/i.test(item));
    const oneDayChoice = isOneDayPlanChoice(message);
    const multiDayChoice = isMultiDayPlanChoice(message);

    // Assess chapter-wise revision requests before asking about plan scope. Otherwise
    // “GST detailed revision” gets routed to the generic 1-day/7-day prompt and skips
    // the chapter-strength workflow entirely.
    const assessmentTarget = resolveCourseAssessmentTarget(normalizedMessage, course as PlannerCourse | 'CA_FINAL')
      || (priorScopeQuestion ? resolveCourseAssessmentTarget(conversationText, course as PlannerCourse | 'CA_FINAL') : null);
    const assessmentRequest = shouldPrioritizeChapterAssessment({
      course,
      hasTarget: Boolean(assessmentTarget),
      conversationText,
      priorScopeQuestion,
    });

    const requestForPlan = explicitPlan || parsedProbe.intent === 'create_study_plan'
      || (parsedProbe.intent === 'clarify' && parsedProbe.subjects.length > 0 && /\b(?:revision|revise|study plan|timetable|schedule)\b/i.test(message));

    // Ask about the scope only if the student did not already specify one day or several days.
    if (requestForPlan && !oneDayChoice && !multiDayChoice && !priorScopeQuestion && !assessmentRequest && !assessmentTarget) {
      return res.json({
        success: true, status: 'choose_plan_scope',
        message: replyLanguage === 'hindi'
          ? 'आपको कौन-सा plan चाहिए—सिर्फ एक दिन का revision plan या exam तक का roadmap और weekly timetable?'
          : replyLanguage === 'hinglish'
            ? 'Kis type ka plan chahiye—sirf ek din ka revision plan ya exam tak roadmap aur weekly timetable?'
            : 'Which plan would you like: a one-day revision plan, or a full exam roadmap with a rolling weekly timetable until your exam?',
        parsed: { ...parsedProbe, intent: 'clarify', missing_info: [], should_call_planner: false },
        plan: null,
        follow_up_options: buildPlanScopeOptions(replyLanguage),
        reply_language: replyLanguage,
        metadata: { version: 'planner-scope-clarification-v2', modelUsed: false, persistentStorage: false },
      });
    }

    // A multi-day selection generates an actual dated schedule, rather than just describing one.
    if (multiDayChoice && (priorScopeQuestion || requestForPlan) && !assessmentRequest && !assessmentTarget) {
      const userTurns = history.filter((item) => /^Student:\s*/i.test(item)).map((item) => item.replace(/^Student:\s*/i, ''));
      userTurns.push(message);
      const parsed = parseStudyPlannerConversationRequest(userTurns.join('. '), [], course);
      if (!parsed.subjects.length) {
        parsed.intent = 'clarify'; parsed.missing_info = ['subject or study goal']; parsed.should_call_planner = false;
        return res.json({
          success: true, status: 'needs_clarification',
          message: replyLanguage === 'hindi' ? 'किस subject या topic का day-wise plan बनाऊँ?' : replyLanguage === 'hinglish' ? 'Bhai, kis subject ya topic ka day-wise plan banaun?' : 'Which subject or topic should I build the day-wise plan for?',
          parsed, plan: null, metadata: { version: 'planner-scope-clarification-v1', modelUsed: false, persistentStorage: false },
        });
      }
      const settings = body.planner_settings && typeof body.planner_settings === 'object' ? body.planner_settings as Record<string, unknown> : {};
      const startDate = typeof settings.start_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(settings.start_date)
        ? settings.start_date : new Date().toISOString().slice(0, 10);
      const configuredHours = Number(settings.daily_study_hours || (Number(body.default_duration_minutes) || 240) / 60);
      const studyStart = typeof settings.study_start_time === 'string' ? settings.study_start_time : '06:00';
      const preferredEnd = typeof settings.preferred_end_time === 'string' ? settings.preferred_end_time : '22:00';
      const attempt = typeof settings.attempt === 'string' ? settings.attempt : 'May 2027';
      const exactExamDate = typeof settings.exact_exam_date === 'string' && settings.exact_exam_date ? settings.exact_exam_date : null;
      const savedChapters = db.prepare(
        'SELECT subject, chapter, strength FROM student_chapter_strengths WHERE user_id = ? AND course = ? AND chapter != ?'
      ).all(req.user.id, course, '__SUBJECT_LEVEL__') as Array<{ subject: string; chapter: string; strength: string }>;
      const priorities: Array<{ subject: string; chapter: string; strength: string; priority_score: number }> = savedChapters.map((item) => ({
        ...item, priority_score: item.strength === 'WEAK' ? 100 : item.strength === 'MODERATE' ? 55 : 15,
      }));
      if (!priorities.length) {
        for (const subject of parsed.subjects) priorities.push({ subject, chapter: 'General revision', strength: 'MODERATE', priority_score: 55 });
      }
      try {
        const schedule = createMultiDayStudyPlan({
          start_date: startDate, daily_study_hours: configuredHours, study_start_time: studyStart,
          preferred_end_time: preferredEnd, attempt, exact_exam_date: exactExamDate,
          class_mode: settings.class_mode === 'fixed' || settings.class_mode === 'flexible' ? settings.class_mode : 'none',
          class_blocks: Array.isArray(settings.class_blocks) ? settings.class_blocks as Array<{ day_of_week: number; start_time: string; end_time: string; label?: string }> : [],
          priorities,
        });
        const sessions = schedule.sessions.map((session, index) => ({
          order: index + 1, subject: session.subject, chapter: session.chapter, label: session.label,
          minutes: session.minutes, instruction: session.instruction, date: session.date,
          start_time: session.start_time, end_time: session.end_time,
        }));
        const plan = {
          title: '7-day study plan · ' + schedule.attempt,
          total_minutes: sessions.reduce((sum, session) => sum + session.minutes, 0),
          subjects: Array.from(new Set(sessions.map((session) => session.subject))),
          sessions, saved: false as const,
          note: 'Draft for ' + schedule.start_date + ' to ' + schedule.end_date + '. Not saved yet; review it and choose Save plan.',
        };
        parsed.intent = 'create_study_plan'; parsed.duration_minutes = plan.total_minutes;
        parsed.schedule_mode = 'weekly_recurring'; parsed.missing_info = []; parsed.should_call_planner = true;
        return res.json({
          success: true, status: 'plan_draft_ready',
          message: replyLanguage === 'hinglish' ? 'Bhai, exam date tak ka day-wise roadmap ready hai. Har session mein date, time aur revision round (R1/R2/R3/R4) diya hai; review karke Save plan kar sakta hai.' : 'Your day-wise study roadmap through the exact exam date is ready. Each session includes a date, time, and revision-round label; review it before saving.',
          parsed, plan, metadata: { version: 'planner-chat-weekly-v1', modelUsed: false, persistentStorage: true },
        });
      } catch (error) {
        return res.status(400).json({ success: false, status: 'plan_generation_failed', error: error instanceof Error ? error.message : 'Could not create weekly plan.' });
      }
    }

    // Detailed chapter assessments remain an Intermediate-specific workflow.
    if (assessmentTarget && !Array.isArray(body.chapter_ratings) && (assessmentRequest || priorScopeQuestion)) {
      return res.json({
        success: true,
        status: 'needs_chapter_assessment',
        message: buildChapterAssessmentPrompt(replyLanguage, assessmentTarget.label),
        parsed: { intent: 'clarify', course, subjects: [assessmentTarget.label], duration_minutes: null, focus_text: assessmentTarget.label + ' chapter-wise revision', date_text: null, schedule_mode: 'one_time', class_time_text: null, performance_data: [], missing_info: [assessmentTarget.label + ' chapter strengths', 'available study time'], should_call_planner: false },
        plan: null,
        chapter_assessment: { subject: assessmentTarget.label, storage_subject: assessmentTarget.storageSubject, chapters: assessmentTarget.chapters },
        plan_scope: body.plan_scope === 'one_day' || oneDayChoice ? 'one_day' : (body.plan_scope === 'exam_roadmap' || isExamRoadmapChoice(message) || multiDayChoice ? 'exam_roadmap' : 'one_day'),
        reply_language: replyLanguage,
        metadata: { version: 'planner-chapter-assessment-v3', modelUsed: false, persistentStorage: true },
      });
    }

    if (assessmentTarget && Array.isArray(body.chapter_ratings)) {
      const submitted = body.chapter_ratings as Array<{ chapter?: unknown; strength?: unknown }>;
      const allowed = new Set(assessmentTarget.chapters);
      const ratings = submitted.map((item) => ({
        chapter: typeof item?.chapter === 'string' ? item.chapter : '',
        strength: typeof item?.strength === 'string' ? item.strength.toUpperCase() : '',
      }));
      const minutes = Number(body.available_minutes);
      const requestedPlanScope = body.plan_scope === 'exam_roadmap' ? 'exam_roadmap' : 'one_day';
      const plannerSettings = body.planner_settings && typeof body.planner_settings === 'object' ? body.planner_settings as Record<string, unknown> : {};
      const roadmapStartDate = typeof plannerSettings.start_date === 'string' ? plannerSettings.start_date : new Date().toISOString().slice(0, 10);
      const exactExamDate = typeof plannerSettings.exact_exam_date === 'string' ? plannerSettings.exact_exam_date : '';
      const validISODate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
        && !Number.isNaN(new Date(value + 'T00:00:00.000Z').getTime())
        && new Date(value + 'T00:00:00.000Z').toISOString().slice(0, 10) === value;
      const dailyStudyHours = Number(plannerSettings.daily_study_hours || 4);
      if (requestedPlanScope === 'exam_roadmap' && (
        !validISODate(roadmapStartDate)
        || !validISODate(exactExamDate)
        || exactExamDate < roadmapStartDate
        || (Date.parse(exactExamDate + 'T00:00:00.000Z') - Date.parse(roadmapStartDate + 'T00:00:00.000Z')) / 86400000 < 13
        || !Number.isFinite(dailyStudyHours) || dailyStudyHours < 1 || dailyStudyHours > 12
      )) {
        return res.status(400).json({ success: false, error: replyLanguage === 'hindi'
          ? 'Exam roadmap के लिए settings में सही exam date (कम से कम 14 दिन आगे) और daily study hours चुनें।'
          : replyLanguage === 'hinglish'
            ? 'Exam roadmap ke liye settings mein exact exam date (kam se kam 14 din baad) aur daily study hours set karo.'
            : 'For an exam roadmap, set a valid exact exam date at least 14 days away and choose daily study hours in the planner settings.' });
      }
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
      db.exec('BEGIN IMMEDIATE');
      try {
        for (const item of ratings) saveStrength.run(randomUUID(), req.user!.id, assessmentTarget.storageSubject, item.chapter, item.strength);
        db.exec('COMMIT');
      } catch (persistError) {
        db.exec('ROLLBACK');
        throw persistError;
      }

      if (requestedPlanScope === 'exam_roadmap') {
        try {
          const syllabusCompletion = Number(plannerSettings.syllabus_completion_percent ?? 40);
          const roadmap = createAttemptStudyPhases({
            start_date: roadmapStartDate,
            exact_exam_date: exactExamDate,
            syllabus_completion_percent: syllabusCompletion,
          });
          const allRatedChapters = db.prepare(
            'SELECT subject, chapter, strength FROM student_chapter_strengths WHERE user_id = ? AND course = ? AND chapter != ?'
          ).all(req.user!.id, course, '__SUBJECT_LEVEL__') as Array<{ subject: string; chapter: string; strength: string }>;
          const priorities = allRatedChapters.map((item) => ({
            ...item,
            priority_score: item.strength === 'WEAK' ? 100 : item.strength === 'MODERATE' ? 55 : 15,
          }));
          const revisionRounds = createAdaptiveRevisionRounds({
            start_date: roadmapStartDate,
            exact_exam_date: exactExamDate,
            daily_study_hours: dailyStudyHours,
            chapters: priorities,
          });
          const schedule = createMultiDayStudyPlan({
            start_date: roadmapStartDate,
            daily_study_hours: dailyStudyHours,
            study_start_time: typeof plannerSettings.study_start_time === 'string' ? plannerSettings.study_start_time : '06:00',
            preferred_end_time: typeof plannerSettings.preferred_end_time === 'string' ? plannerSettings.preferred_end_time : '22:00',
            attempt: typeof plannerSettings.attempt === 'string' ? plannerSettings.attempt : 'May 2027',
            exact_exam_date: exactExamDate,
            schedule_through_exam: true,
            class_mode: plannerSettings.class_mode === 'fixed' || plannerSettings.class_mode === 'flexible' ? plannerSettings.class_mode : 'none',
            class_blocks: Array.isArray(plannerSettings.class_blocks) ? plannerSettings.class_blocks as Array<{ day_of_week: number; start_time: string; end_time: string; label?: string }> : [],
            priorities,
          });
          const scheduleSessions = schedule.sessions.map((session, index) => {
            const round = revisionRounds.find((item) => session.date >= item.start_date && session.date <= item.end_date);
            return {
              order: index + 1, subject: session.subject, chapter: session.chapter,
              label: (round ? round.key + ' · ' : '') + session.label,
              round_key: round?.key || null, round_title: round?.title || null,
              minutes: session.minutes, instruction: session.instruction, date: session.date,
              start_time: session.start_time, end_time: session.end_time,
            };
          });
          const plan = {
            title: 'Exam roadmap timetable · ' + schedule.attempt,
            total_minutes: scheduleSessions.reduce((sum, session) => sum + session.minutes, 0),
            subjects: Array.from(new Set(scheduleSessions.map((session) => session.subject))),
            sessions: scheduleSessions,
            saved: false as const,
            note: 'Full dated schedule from ' + schedule.start_date + ' through the exact exam date ' + schedule.end_date + ', grouped into revision rounds. Check round labels and dates before following the plan.',
          };
          return res.json({
            success: true,
            status: 'exam_roadmap_draft_ready',
            message: replyLanguage === 'hindi'
              ? 'Exam तक का roadmap और आपकी अगली weekly timetable तैयार है। R1–R4 की अवधि chapter ratings, exam date और daily study hours के आधार पर तय की गई है।'
              : replyLanguage === 'hinglish'
                ? 'Exam tak ka roadmap aur agle 7 din ki weekly timetable ready hai. R1–R4 ki duration chapter ratings, exam date aur daily study hours ke hisaab se calculate hui hai.'
                : 'Your exam-till-date roadmap and next weekly timetable are ready. R1–R4 durations use your chapter ratings, exact exam date, and daily study hours.',
            reply_language: replyLanguage,
            plan_scope: 'exam_roadmap',
            parsed: { intent: 'create_study_plan', course, subjects: plan.subjects, duration_minutes: plan.total_minutes, focus_text: 'Adaptive revision rounds and weekly timetable through the exam', date_text: null, schedule_mode: 'weekly_recurring', class_time_text: null, performance_data: [], missing_info: [], should_call_planner: true },
            plan,
            roadmap,
            revision_rounds: revisionRounds,
            metadata: { version: 'planner-exam-roadmap-chat-v1', modelUsed: false, persistentStorage: true },
          });
        } catch (error) {
          return res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Could not build the exam roadmap.' });
        }
      }

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
        message: buildChapterAssessmentReadyMessage(replyLanguage, assessmentTarget.label),
        parsed: { intent: 'create_study_plan', course, subjects: [assessmentTarget.label], duration_minutes: minutes, focus_text: assessmentTarget.label + ' chapter-wise detailed revision', date_text: null, schedule_mode: 'one_time', class_time_text: null, performance_data: [], missing_info: [], should_call_planner: true },
        plan,
        reply_language: replyLanguage,
        plan_scope: 'one_day',
        metadata: { version: 'planner-chapter-revision-v3', modelUsed: false, persistentStorage: true },
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

    const parsed = parseStudyPlannerConversationRequest(message, history, course);
    // A study question should receive an answer, not be forced through the timetable form.
    if (parsed.intent === 'clarify' && isGeneralStudyQuestion(message)) {
      parsed.intent = 'general_guidance';
      parsed.missing_info = [];
      parsed.should_call_planner = false;
    }
    const usedDefaultDuration = applyDefaultStudyDuration(parsed, body.default_duration_minutes ?? 240);
    const plan = createStudyPlanDraft(parsed);

    let status = 'request_parsed';
    let responseMessage = 'Request parsed. This beta does not save class changes, study progress, or chapter priorities.';

    if (parsed.intent === 'out_of_scope') {
      status = 'out_of_scope';
      responseMessage = replyLanguage === 'hinglish'
        ? 'Bhai, main CA study-related topics mein help karta hoon. CA level/subject clear karke question dobara bhej de.'
        : replyLanguage === 'hindi'
          ? 'मैं CA की पढ़ाई से जुड़े topics में मदद करता हूँ। CA level या subject स्पष्ट करके question दोबारा भेजें।'
          : 'I focus on CA study-related questions. Please clarify the CA level or subject and try again.';
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
