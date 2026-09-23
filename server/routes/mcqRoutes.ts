import { Router, Response } from 'express';
import { authenticateToken, AuthRequest, requireMcqAdmin } from '../auth.js';
import {
  getCurriculumStats,
  createSession,
  getSession,
  submitAnswer,
  finishSession,
  getStudentProgress,
  toggleBookmark,
  getBookmarks,
  getWrongVault,
  resolveWrongQuestion,
  getAdminQuestions,
  createAdminQuestion,
  updateAdminQuestion,
  deleteAdminQuestion,
  bulkUpdateQuestionStatus,
  getAdminStats,
} from '../services/mcqService.js';

const router = Router();

// ==========================================
// ALL MCQ ROUTES REQUIRE AUTHENTICATION
// (STRICTLY NO PUBLIC MCQ ACCESS)
// ==========================================
router.use(authenticateToken);

// ------------------------------------------
// STUDENT ROUTES
// ------------------------------------------

// 1. Get Curriculum Available Counts
router.get('/curriculum', (req: AuthRequest, res: Response) => {
  try {
    const stats = getCurriculumStats();
    res.json({ stats });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to load curriculum statistics' });
  }
});

// 2. Create Practice / Mock Session (Strict Filter Enforcement)
router.post('/sessions/create', (req: AuthRequest, res: Response) => {
  try {
    const studentId = req.user!.id;
    const { course, subject, chapter, topic, questionType, difficulty, sessionType, requestedCount, durationMinutes } = req.body;

    if (!course || !subject) {
      return res.status(400).json({ error: 'Please select Course and Subject to begin.' });
    }

    const result = createSession(studentId, {
      course,
      subject,
      chapter,
      topic,
      questionType,
      difficulty,
      sessionType: sessionType || 'practice',
      requestedCount: requestedCount ? parseInt(requestedCount, 10) : 10,
      durationMinutes: durationMinutes ? parseInt(durationMinutes, 10) : undefined,
    });

    if ('error' in result) {
      return res.status(400).json(result);
    }

    res.status(201).json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to start MCQ session' });
  }
});

// 3. Get Session by ID
router.get('/sessions/:id', (req: AuthRequest, res: Response) => {
  try {
    const studentId = req.user!.id;
    const session = getSession(req.params.id, studentId);

    if (!session) {
      return res.status(404).json({ error: 'MCQ session not found or access denied.' });
    }

    res.json(session);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to retrieve session' });
  }
});

// 4. Submit Answer for a Question in Session
router.post('/sessions/:id/submit-answer', (req: AuthRequest, res: Response) => {
  try {
    const studentId = req.user!.id;
    const { questionId, selectedOption, isMarkedForReview, eliminatedOptions, timeTakenSeconds } = req.body;

    if (!questionId) {
      return res.status(400).json({ error: 'Question ID is required.' });
    }

    const result = submitAnswer(req.params.id, studentId, {
      questionId,
      selectedOption,
      isMarkedForReview,
      eliminatedOptions,
      timeTakenSeconds,
    });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to submit answer' });
  }
});

// 5. Complete / Finish Session & Compute Results
router.post('/sessions/:id/finish', (req: AuthRequest, res: Response) => {
  try {
    const studentId = req.user!.id;
    const { timeSpentSeconds } = req.body;

    const result = finishSession(req.params.id, studentId, timeSpentSeconds || 0);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to finalize session' });
  }
});

// 6. Student Progress & Analytics
router.get('/progress', (req: AuthRequest, res: Response) => {
  try {
    const studentId = req.user!.id;
    const progress = getStudentProgress(studentId);
    res.json(progress);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to retrieve progress' });
  }
});

// 7. Student Bookmarks
router.get('/bookmarks', (req: AuthRequest, res: Response) => {
  try {
    const studentId = req.user!.id;
    const bookmarks = getBookmarks(studentId);
    res.json({ bookmarks });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to retrieve bookmarks' });
  }
});

router.post('/bookmarks/toggle', (req: AuthRequest, res: Response) => {
  try {
    const studentId = req.user!.id;
    const { questionId, notes } = req.body;
    if (!questionId) {
      return res.status(400).json({ error: 'Question ID is required' });
    }
    const result = toggleBookmark(studentId, questionId, notes);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update bookmark' });
  }
});

// 8. Wrong Questions Vault (Mistake Vault)
router.get('/wrong-vault', (req: AuthRequest, res: Response) => {
  try {
    const studentId = req.user!.id;
    const includeResolved = req.query.includeResolved === 'true';
    const vault = getWrongVault(studentId, includeResolved);
    res.json({ wrongVault: vault });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to retrieve wrong questions vault' });
  }
});

router.post('/wrong-vault/resolve', (req: AuthRequest, res: Response) => {
  try {
    const studentId = req.user!.id;
    const { questionId } = req.body;
    if (!questionId) {
      return res.status(400).json({ error: 'Question ID is required' });
    }
    const result = resolveWrongQuestion(studentId, questionId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to resolve wrong question' });
  }
});

// ------------------------------------------
// MCQ ADMIN PORTAL ENDPOINTS
// (MANDATORY MFA & MCQ_ADMIN / SUPER_ADMIN ROLE)
// ------------------------------------------

router.get('/admin/stats', requireMcqAdmin, (req: AuthRequest, res: Response) => {
  try {
    const stats = getAdminStats();
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to retrieve admin statistics' });
  }
});

router.get('/admin/questions', requireMcqAdmin, (req: AuthRequest, res: Response) => {
  try {
    const { course, subject, status, search, page, limit } = req.query;
    const data = getAdminQuestions({
      course: course as string,
      subject: subject as string,
      status: status as string,
      search: search as string,
      page: page ? parseInt(page as string, 10) : 1,
      limit: limit ? parseInt(limit as string, 10) : 20,
    });
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to list questions' });
  }
});

router.post('/admin/questions', requireMcqAdmin, (req: AuthRequest, res: Response) => {
  try {
    const adminId = req.user!.id;
    const data = req.body;

    if (!data.course || !data.subject || !data.chapter || !data.questionText || !data.optionA || !data.optionB || !data.optionC || !data.optionD || !data.correctAnswer || !data.explanation) {
      return res.status(400).json({
        error: 'Please fill in all mandatory fields (Course, Subject, Chapter, Question Text, 4 Options, Correct Answer, Explanation).',
      });
    }

    const created = createAdminQuestion(data, adminId);
    res.status(201).json({ question: created });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create question' });
  }
});

router.put('/admin/questions/:id', requireMcqAdmin, (req: AuthRequest, res: Response) => {
  try {
    const adminId = req.user!.id;
    const updated = updateAdminQuestion(req.params.id, req.body, adminId);
    res.json({ question: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update question' });
  }
});

router.delete('/admin/questions/:id', requireMcqAdmin, (req: AuthRequest, res: Response) => {
  try {
    const result = deleteAdminQuestion(req.params.id);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to delete question' });
  }
});

router.post('/admin/questions/bulk-status', requireMcqAdmin, (req: AuthRequest, res: Response) => {
  try {
    const { ids, status } = req.body;
    if (!Array.isArray(ids) || !status) {
      return res.status(400).json({ error: 'IDs array and target status are required.' });
    }
    const result = bulkUpdateQuestionStatus(ids, status);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update question status' });
  }
});

export default router;
