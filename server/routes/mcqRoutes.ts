import { Router, Response, NextFunction } from 'express';
import { authenticateToken, AuthRequest, requireMcqAdmin } from '../auth.js';
import { requireFeatureAccess } from '../services/featureControlService.js';
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
  deleteAdminQuestions,
  getMatchingQuestionsSummary,
  deleteAllMatchingQuestions,
  bulkUpdateQuestionStatus,
  getAdminStats,
  getAdminCases,
  getAdminCaseById,
  bulkUpdateCaseStatus,
  deleteAdminCase,
} from '../services/mcqService.js';
import {
  validateMaterialFile,
  extractTextSafely,
  checkMcqMaterialDuplicate,
  saveMcqMaterial,
  listMcqMaterials,
  getMcqMaterialById,
  updateMcqMaterial,
  deleteMcqMaterial,
  getMaterialLinkedSummary,
  getMaterialsBulkStats,
  deleteMcqMaterialsBulk,
  getMaterialFileStream,
} from '../services/mcqMaterialService.js';
import {
  parseCsvText,
  parseXlsxBuffer,
  validateBulkQuestions,
  commitBulkQuestions,
} from '../services/mcqBulkImportService.js';
import { computeFileHash } from '../services/materialDuplicateProtectionService.js';
import { parseMaterialTextDeterministic } from '../services/mcqDeterministicParser.js';
import { db } from '../db.js';

const router = Router();

// ==========================================
// ALL MCQ ROUTES REQUIRE AUTHENTICATION
// (STRICTLY NO PUBLIC MCQ ACCESS)
// ==========================================
router.use(authenticateToken);

// ==========================================
// FEATURE ACCESS POLICY ENFORCEMENT
// Normal students: strictly gated by MCQ Arena feature status (ENABLED / TESTING / DISABLED)
// Admin routes (/admin/*): bypass student feature gating and enforce requireMcqAdmin
// ==========================================
const enforceStudentMcqAccess = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.path.startsWith('/admin')) {
    return next();
  }
  return requireFeatureAccess('mcq_arena')(req, res, next);
};
router.use(enforceStudentMcqAccess);

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
    const {
      course,
      subject,
      chapter,
      chapters,
      topic,
      questionType,
      difficulty,
      source,
      sourceCategory,
      attempt,
      sessionType,
      requestedCount,
      durationMinutes,
    } = req.body;

    if (!course || !subject) {
      return res.status(400).json({ error: 'Please select Course and Subject to begin.' });
    }

    const result = createSession(studentId, {
      course,
      subject,
      chapter,
      chapters,
      topic,
      questionType,
      difficulty,
      source: source || sourceCategory,
      attempt,
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
    const adminId = req.user?.id || 'system';
    const result = deleteAdminQuestion(req.params.id, adminId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to delete question' });
  }
});

router.post('/admin/questions/bulk-delete', requireMcqAdmin, (req: AuthRequest, res: Response) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) {
      return res.status(400).json({ error: 'IDs array is required for bulk deletion.' });
    }
    const adminId = req.user?.id || 'system';
    const result = deleteAdminQuestions(ids, adminId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to bulk delete questions' });
  }
});

router.post('/admin/questions/delete-all-summary', requireMcqAdmin, (req: AuthRequest, res: Response) => {
  try {
    const summary = getMatchingQuestionsSummary(req.body || {});
    res.json(summary);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to calculate delete-all summary' });
  }
});

router.post('/admin/questions/delete-all-matching', requireMcqAdmin, (req: AuthRequest, res: Response) => {
  try {
    const adminId = req.user?.id || 'system';
    const result = deleteAllMatchingQuestions(req.body || {}, adminId);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to delete matching questions' });
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

// ------------------------------------------
// MCQ ADMIN: MATERIAL LIBRARY (PDF & TXT)
// ------------------------------------------

// 1. Validate & Preview Material Upload (PDF or TXT)
router.post('/admin/materials/validate-preview', requireMcqAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { fileBase64, filename, mimeType, course, subject, materialType, attempt, overrideDuplicate, overrideReason } = req.body;

    if (!fileBase64) {
      return res.status(400).json({ error: 'No document data provided. Please select a PDF or TXT file.' });
    }

    const cleanBase64 = fileBase64.includes(',') ? fileBase64.split(',')[1] : fileBase64;
    const buffer = Buffer.from(cleanBase64, 'base64');

    // 1. Strict file signature / format validation (PDF/TXT only, no CSV/XLSX)
    const valResult = await validateMaterialFile(buffer, filename || 'source_material', mimeType);
    if (!valResult.valid || !valResult.fileType) {
      return res.status(400).json({ error: valResult.error || 'Invalid file type. Supported formats: PDF, TXT.' });
    }

    // 2. Safe text extraction without destroying questions or formatting
    const extraction = await extractTextSafely(buffer, valResult.fileType, valResult.sanitizedFilename);

    // 3. Duplicate detection
    const fileHash = computeFileHash(buffer);
    const duplicateCheck = checkMcqMaterialDuplicate({
      fileHash,
      extractedText: extraction.extractedText,
      course: course || 'CA_INTERMEDIATE',
      subject: subject || 'Corporate and Other Laws',
      materialType: materialType || 'MTP',
      attempt,
      overrideDuplicate: Boolean(overrideDuplicate),
      overrideReason,
    });

    return res.json({
      valid: true,
      fileType: valResult.fileType,
      fileName: valResult.sanitizedFilename,
      fileSize: buffer.length,
      fileHash,
      pageCount: extraction.pageCount,
      extractedTextSnippet: extraction.extractedText.slice(0, 1500),
      fullExtractedText: extraction.extractedText,
      titleHint: extraction.titleHint,
      duplicateCheck,
    });
  } catch (err: any) {
    console.error('Material validate preview error:', err);
    return res.status(500).json({ error: err.message || 'Failed to validate and preview material document' });
  }
});

// ==========================================
// 8-STEP ADMIN CONTENT FLOW (Upload -> Process -> Review -> Publish)
// 100% Deterministic, Rule-Based, ZERO AI
// ==========================================

// 1. Step 3: Validate & Process PDF/TXT
router.post('/admin/material-flow/process', requireMcqAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const {
      materialName,
      course,
      subject,
      sourceCategory,
      attempt,
      fileBase64,
      originalFilename,
      mimeType,
    } = req.body;

    if (!materialName || !course || !subject || !sourceCategory) {
      return res.status(400).json({ error: 'Material Name, Course, Subject, and Source Category are required.' });
    }

    if (!fileBase64) {
      return res.status(400).json({ error: 'Please upload a PDF or TXT source document.' });
    }

    const cleanBase64 = fileBase64.includes(',') ? fileBase64.split(',')[1] : fileBase64;
    const buffer = Buffer.from(cleanBase64, 'base64');

    // 1. File validation: strictly PDF or TXT
    const valResult = await validateMaterialFile(buffer, originalFilename || 'material_doc', mimeType);
    if (!valResult.valid || !valResult.fileType) {
      return res.status(400).json({ error: valResult.error || 'Invalid file format. Supported formats: PDF, TXT.' });
    }

    // 2. Safe text extraction (Deterministic, zero AI)
    const extraction = await extractTextSafely(buffer, valResult.fileType, valResult.sanitizedFilename);

    // 3. Deterministic MCQ & Case Study extraction
    const parsedResult = parseMaterialTextDeterministic({
      rawText: extraction.extractedText,
      course,
      subject,
      sourceCategory,
      attempt,
      materialName,
      pdfDiagnosis: extraction.pdfDiagnosis,
    });

    const fileHash = computeFileHash(buffer);

    return res.json({
      ...parsedResult,
      fileHash,
      fileType: valResult.fileType,
      fileName: valResult.sanitizedFilename,
      fileSize: buffer.length,
      pageCount: extraction.pageCount,
      pdfDiagnosis: extraction.pdfDiagnosis,
    });
  } catch (err: any) {
    console.error('Material flow process error:', err);
    return res.status(500).json({ error: err.message || 'Failed to process material file.' });
  }
});

// 2. Step 5: Save as Draft
router.post('/admin/material-flow/save-draft', requireMcqAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const {
      materialName,
      course,
      subject,
      sourceCategory,
      attempt,
      description,
      fileBase64,
      originalFilename,
      mimeType,
      questions,
      cases,
    } = req.body;

    if (!materialName || !course || !subject || !Array.isArray(questions)) {
      return res.status(400).json({ error: 'Material metadata and questions list are required.' });
    }

    let materialId = `mat_${crypto.randomUUID().slice(0, 12)}`;
    let fileBuffer: Buffer | undefined;

    if (fileBase64) {
      const cleanBase64 = fileBase64.includes(',') ? fileBase64.split(',')[1] : fileBase64;
      fileBuffer = Buffer.from(cleanBase64, 'base64');
    }

    // Save Material Record as Draft
    if (fileBuffer) {
      const valResult = await validateMaterialFile(fileBuffer, originalFilename || 'material_doc', mimeType);
      const savedMat = await saveMcqMaterial({
        materialName,
        course,
        subject,
        materialType: sourceCategory || 'ICAI Module',
        source: sourceCategory === 'Self-Created' ? 'Self-Created' : 'ICAI',
        attempt,
        description,
        status: 'Draft',
        fileBuffer,
        originalFilename: valResult.sanitizedFilename || 'material.pdf',
        fileType: valResult.fileType || 'PDF',
        pageCount: 1,
        extractedText: '',
        uploadedBy: req.user!.id,
      });
      materialId = savedMat.id;
    }

    // Save Cases as Draft
    if (Array.isArray(cases)) {
      const insertCaseStmt = db.prepare(`
        INSERT INTO mcq_cases (
          id, case_id, course, subject, chapter, case_title, case_scenario, difficulty, status, created_by, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        ON CONFLICT(case_id) DO UPDATE SET
          case_title = excluded.case_title,
          case_scenario = excluded.case_scenario,
          status = 'draft',
          updated_at = CURRENT_TIMESTAMP
      `);

      for (const cs of cases) {
        const cDbId = `case_db_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        insertCaseStmt.run(
          cDbId,
          cs.caseId,
          course,
          subject,
          cs.chapter || 'General',
          cs.caseTitle || `${materialName} - ${cs.caseId}`,
          cs.caseScenario,
          cs.difficulty || 'moderate',
          req.user!.id
        );
      }
    }

    // Save Questions as Draft
    const insertQStmt = db.prepare(`
      INSERT INTO mcq_questions (
        id, course, subject, chapter, topic, question_type, case_id, case_sequence, case_study_scenario,
        difficulty, source, attempt, question_text, option_a, option_b, option_c, option_d,
        correct_answer, explanation, reference, status, source_material_id, source_page,
        created_by, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, 'draft', ?, ?,
        ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      ON CONFLICT(id) DO UPDATE SET
        course = excluded.course,
        subject = excluded.subject,
        chapter = excluded.chapter,
        topic = excluded.topic,
        question_type = excluded.question_type,
        case_id = excluded.case_id,
        case_sequence = excluded.case_sequence,
        case_study_scenario = excluded.case_study_scenario,
        difficulty = excluded.difficulty,
        source = excluded.source,
        attempt = excluded.attempt,
        question_text = excluded.question_text,
        option_a = excluded.option_a,
        option_b = excluded.option_b,
        option_c = excluded.option_c,
        option_d = excluded.option_d,
        correct_answer = excluded.correct_answer,
        explanation = excluded.explanation,
        reference = excluded.reference,
        status = 'draft',
        source_material_id = excluded.source_material_id,
        source_page = excluded.source_page,
        updated_at = CURRENT_TIMESTAMP
    `);

    // Multi-material junction recording
    const insertJunctionStmt = db.prepare(`
      INSERT OR IGNORE INTO mcq_question_materials (question_id, material_id, source_page, created_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `);

    const savedQuestionIds: string[] = [];

    for (const q of questions) {
      const qId = q.id || `mcq_${crypto.randomUUID().slice(0, 16)}`;
      insertQStmt.run(
        qId,
        course,
        subject,
        q.chapter || 'General',
        q.topic || 'Core Concept',
        q.questionType || 'normal',
        q.caseId || null,
        q.caseSequence || null,
        q.caseScenario || null,
        q.difficulty || 'moderate',
        sourceCategory || 'ICAI Module',
        attempt || null,
        q.questionText,
        q.optionA,
        q.optionB,
        q.optionC || 'None of the above',
        q.optionD || 'All of the above',
        q.correctAnswer || 'A',
        q.explanation || `As per authoritative ICAI study guidelines for ${subject}.`,
        q.reference || `${sourceCategory}${attempt ? ` ${attempt}` : ''}`,
        materialId,
        q.sourcePage || null,
        req.user!.id
      );

      insertJunctionStmt.run(qId, materialId, q.sourcePage || null);
      savedQuestionIds.push(qId);
    }

    return res.json({
      success: true,
      materialId,
      savedQuestionCount: savedQuestionIds.length,
      savedQuestionIds,
      status: 'draft',
    });
  } catch (err: any) {
    console.error('Save material flow draft error:', err);
    return res.status(500).json({ error: err.message || 'Failed to save material drafts.' });
  }
});

// 3. Step 7: Approve Questions
router.post('/admin/material-flow/approve', requireMcqAdmin, (req: AuthRequest, res: Response) => {
  try {
    const { questionIds, caseIds } = req.body;
    if (!Array.isArray(questionIds) || questionIds.length === 0) {
      return res.status(400).json({ error: 'questionIds array is required.' });
    }

    // Validation pass on all questions
    const placeholders = questionIds.map(() => '?').join(',');
    const questions = db.prepare(`SELECT * FROM mcq_questions WHERE id IN (${placeholders})`).all(...questionIds) as any[];

    const validationErrors: string[] = [];
    for (const q of questions) {
      if (!q.question_text || q.question_text.trim().length < 5) {
        validationErrors.push(`Question ${q.id}: Question text too short or empty.`);
      }
      if (!q.option_a || !q.option_b) {
        validationErrors.push(`Question ${q.id}: Missing options A or B.`);
      }
      if (!['A', 'B', 'C', 'D'].includes((q.correct_answer || '').trim().toUpperCase())) {
        validationErrors.push(`Question ${q.id}: Invalid or missing correct answer (must be A, B, C, or D).`);
      }
      if (!q.course || !q.subject) {
        validationErrors.push(`Question ${q.id}: Missing course or subject metadata.`);
      }
      if (q.question_type === 'case_based') {
        if (!q.case_id || !q.case_sequence) {
          validationErrors.push(`Question ${q.id}: Case-based question requires Case ID and Sequence.`);
        }
      }
    }

    if (validationErrors.length > 0) {
      return res.status(400).json({
        error: 'Validation failed for some questions prior to approval.',
        validationErrors,
      });
    }

    // Transition questions to approved
    db.prepare(`
      UPDATE mcq_questions
      SET status = 'approved',
          reviewed_by = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id IN (${placeholders})
    `).run(req.user!.id, ...questionIds);

    // Transition cases if specified
    if (Array.isArray(caseIds) && caseIds.length > 0) {
      const casePlaceholders = caseIds.map(() => '?').join(',');
      db.prepare(`
        UPDATE mcq_cases
        SET status = 'approved',
            updated_at = CURRENT_TIMESTAMP
        WHERE case_id IN (${casePlaceholders})
      `).run(...caseIds);
    }

    return res.json({
      success: true,
      approvedCount: questionIds.length,
      status: 'approved',
    });
  } catch (err: any) {
    console.error('Approve questions error:', err);
    return res.status(500).json({ error: err.message || 'Failed to approve questions.' });
  }
});

// 4. Step 8: Publish Questions
router.post('/admin/material-flow/publish', requireMcqAdmin, (req: AuthRequest, res: Response) => {
  try {
    const { questionIds, materialId, caseIds } = req.body;
    if (!Array.isArray(questionIds) || questionIds.length === 0) {
      return res.status(400).json({ error: 'questionIds array is required.' });
    }

    const placeholders = questionIds.map(() => '?').join(',');

    // Ensure questions are approved or valid draft
    db.prepare(`
      UPDATE mcq_questions
      SET status = 'published',
          reviewed_by = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id IN (${placeholders})
    `).run(req.user!.id, ...questionIds);

    // Publish material record
    if (materialId) {
      db.prepare(`
        UPDATE mcq_materials
        SET status = 'Published',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(materialId);
    }

    // Publish parent cases
    if (Array.isArray(caseIds) && caseIds.length > 0) {
      const casePlaceholders = caseIds.map(() => '?').join(',');
      db.prepare(`
        UPDATE mcq_cases
        SET status = 'published',
            updated_at = CURRENT_TIMESTAMP
        WHERE case_id IN (${casePlaceholders})
      `).run(...caseIds);
    }

    return res.json({
      success: true,
      publishedCount: questionIds.length,
      status: 'published',
    });
  } catch (err: any) {
    console.error('Publish questions error:', err);
    return res.status(500).json({ error: err.message || 'Failed to publish questions.' });
  }
});

// 2. Save New Material
router.post('/admin/materials', requireMcqAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const {
      materialName,
      course,
      subject,
      chapter,
      topic,
      materialType,
      source,
      attempt,
      applicableFrom,
      applicableTill,
      amendmentVersion,
      description,
      status,
      fileBase64,
      originalFilename,
      mimeType,
      overrideDuplicate,
      overrideReason,
    } = req.body;

    if (!materialName || !course || !subject || !materialType) {
      return res.status(400).json({ error: 'Material Name, Course, Subject, and Material Type are required.' });
    }

    if (!fileBase64) {
      return res.status(400).json({ error: 'Please upload a PDF or TXT source document.' });
    }

    const cleanBase64 = fileBase64.includes(',') ? fileBase64.split(',')[1] : fileBase64;
    const buffer = Buffer.from(cleanBase64, 'base64');

    // Re-verify file integrity
    const valResult = await validateMaterialFile(buffer, originalFilename || 'material_doc', mimeType);
    if (!valResult.valid || !valResult.fileType) {
      return res.status(400).json({ error: valResult.error || 'Invalid file format. Supported formats: PDF, TXT.' });
    }

    // Extract text
    const extraction = await extractTextSafely(buffer, valResult.fileType, valResult.sanitizedFilename);

    // Duplicate verification
    const fileHash = computeFileHash(buffer);
    const dupCheck = checkMcqMaterialDuplicate({
      fileHash,
      extractedText: extraction.extractedText,
      course,
      subject,
      materialType,
      attempt,
      overrideDuplicate: Boolean(overrideDuplicate),
      overrideReason,
    });

    if (dupCheck.isDuplicate) {
      return res.status(409).json({
        error: dupCheck.message,
        duplicateCheck: dupCheck,
      });
    }

    const saved = await saveMcqMaterial({
      materialName,
      course,
      subject,
      chapter,
      topic,
      materialType,
      source: source || 'ICAI',
      attempt,
      applicableFrom,
      applicableTill,
      amendmentVersion,
      description,
      status: status || 'Draft',
      fileBuffer: buffer,
      originalFilename: valResult.sanitizedFilename,
      fileType: valResult.fileType,
      pageCount: extraction.pageCount,
      extractedText: extraction.extractedText,
      uploadedBy: req.user!.id,
      overrideReason: overrideDuplicate ? overrideReason : undefined,
    });

    return res.status(201).json({ material: saved });
  } catch (err: any) {
    console.error('Save material error:', err);
    return res.status(500).json({ error: err.message || 'Failed to save material record.' });
  }
});

// 3. List Materials
router.get('/admin/materials', requireMcqAdmin, (req: AuthRequest, res: Response) => {
  try {
    const { course, subject, materialType, status, search, page, limit } = req.query;
    const result = listMcqMaterials({
      course: course as string,
      subject: subject as string,
      materialType: materialType as string,
      status: status as string,
      search: search as string,
      page: page ? parseInt(page as string, 10) : 1,
      limit: limit ? parseInt(limit as string, 10) : 20,
    });
    return res.json(result);
  } catch (err: any) {
    console.error('List materials error:', err);
    return res.status(500).json({ error: 'Failed to retrieve material list' });
  }
});

// 4. Get Single Material
router.get('/admin/materials/:id', requireMcqAdmin, (req: AuthRequest, res: Response) => {
  try {
    const item = getMcqMaterialById(req.params.id);
    if (!item) {
      return res.status(404).json({ error: 'Material not found.' });
    }
    return res.json({ material: item });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch material details.' });
  }
});

// 5. Update Material Metadata & Status
router.put('/admin/materials/:id', requireMcqAdmin, (req: AuthRequest, res: Response) => {
  try {
    const updated = updateMcqMaterial(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ error: 'Material not found' });
    }
    return res.json({ material: updated });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to update material.' });
  }
});

// 5b. Get Single Material Linked Summary
router.get('/admin/materials/:id/linked-summary', requireMcqAdmin, (req: AuthRequest, res: Response) => {
  try {
    const summary = getMaterialLinkedSummary(req.params.id);
    return res.json(summary);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to fetch linked summary' });
  }
});

// 5c. Get Bulk Materials Linked Summary
router.post('/admin/materials/linked-summary', requireMcqAdmin, (req: AuthRequest, res: Response) => {
  try {
    const { materialIds } = req.body;
    if (!Array.isArray(materialIds)) {
      return res.status(400).json({ error: 'materialIds array is required.' });
    }
    const summary = getMaterialsBulkStats(materialIds);
    return res.json(summary);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to fetch bulk linked summary' });
  }
});

// 6. Delete Material (Single Delete with Configurable Linked MCQ Policy)
router.delete('/admin/materials/:id', requireMcqAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const linkedAction = (req.body?.linkedAction || req.query?.linkedAction || 'keep_intact') as any;
    const adminId = req.user?.id || 'MCQ_ADMIN';
    const success = await deleteMcqMaterial(req.params.id, {
      linkedAction,
      deletedBy: adminId,
    });
    if (!success) {
      return res.status(404).json({ error: 'Material not found.' });
    }
    return res.json({ success: true, materialId: req.params.id, linkedAction });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to delete material.' });
  }
});

// 6b. Bulk Delete Materials (Atomic, Idempotent, with Configurable Linked MCQ Policy)
router.post('/admin/materials/bulk-delete', requireMcqAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { materialIds, linkedAction } = req.body;
    if (!Array.isArray(materialIds) || materialIds.length === 0) {
      return res.status(400).json({ error: 'materialIds array is required for bulk deletion.' });
    }
    const adminId = req.user?.id || 'MCQ_ADMIN';
    const result = await deleteMcqMaterialsBulk(materialIds, {
      linkedAction: linkedAction || 'keep_intact',
      deletedBy: adminId,
    });
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to bulk delete materials.' });
  }
});

// 7. Secure File Download (Authenticated Admins Only)
router.get('/admin/materials/:id/download', requireMcqAdmin, (req: AuthRequest, res: Response) => {
  try {
    const fileStream = getMaterialFileStream(req.params.id);
    if (!fileStream) {
      return res.status(404).json({ error: 'Material file not found on server storage.' });
    }

    res.setHeader('Content-Type', fileStream.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileStream.fileName}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Length', fileStream.buffer.length);
    res.setHeader('Cache-Control', 'private, no-cache');
    return res.send(fileStream.buffer);
  } catch (err: any) {
    console.error('Download material file error:', err);
    return res.status(500).json({ error: 'Failed to download material file.' });
  }
});

// ------------------------------------------
// MCQ ADMIN: STRUCTURED MCQ BULK IMPORT (CSV / XLSX)
// ------------------------------------------

// 8. Validate Bulk Import (CSV or XLSX)
router.post('/admin/bulk-import/validate', requireMcqAdmin, (req: AuthRequest, res: Response) => {
  try {
    const { csvText, base64File, fileFormat, defaultValues } = req.body;

    let parsedRows: string[][] = [];

    if (fileFormat === 'XLSX' || (base64File && !csvText)) {
      if (!base64File) {
        return res.status(400).json({ error: 'Please provide XLSX file content.' });
      }
      const buffer = Buffer.from(base64File, 'base64');
      parsedRows = parseXlsxBuffer(buffer);
    } else {
      if (!csvText || !csvText.trim()) {
        return res.status(400).json({ error: 'Please provide CSV content to parse.' });
      }
      parsedRows = parseCsvText(csvText);
    }

    if (parsedRows.length < 2) {
      return res.status(400).json({
        error: 'File must contain at least a header row and one structured question row.',
      });
    }

    const preview = validateBulkQuestions(parsedRows, defaultValues || {});
    return res.json(preview);
  } catch (err: any) {
    console.error('Bulk validate error:', err);
    return res.status(500).json({ error: err.message || 'Failed to parse records.' });
  }
});

// 9. Commit Bulk Questions & Case Bundles (Supports status 'draft' or 'published')
router.post('/admin/bulk-import/commit', requireMcqAdmin, (req: AuthRequest, res: Response) => {
  try {
    const { validRows, status } = req.body;
    if (!Array.isArray(validRows) || validRows.length === 0) {
      return res.status(400).json({ error: 'No valid questions to commit.' });
    }

    const targetStatus = status === 'published' ? 'published' : 'draft';
    const result = commitBulkQuestions(validRows, req.user!.id, targetStatus);
    return res.json(result);
  } catch (err: any) {
    console.error('Commit bulk questions error:', err);
    return res.status(500).json({ error: err.message || 'Failed to import bulk questions.' });
  }
});

// ------------------------------------------
// MCQ ADMIN: CASE BUNDLE APIS
// ------------------------------------------

// 10. List Case Bundles
router.get('/admin/cases', requireMcqAdmin, (req: AuthRequest, res: Response) => {
  try {
    const { course, subject, status, search, page, limit } = req.query;
    const casesData = getAdminCases({
      course: course as string,
      subject: subject as string,
      status: status as string,
      search: search as string,
      page: page ? parseInt(page as string, 10) : 1,
      limit: limit ? parseInt(limit as string, 10) : 20,
    });
    return res.json(casesData);
  } catch (err: any) {
    console.error('Get admin cases error:', err);
    return res.status(500).json({ error: err.message || 'Failed to load case studies.' });
  }
});

// 11. Get Single Case Bundle by ID
router.get('/admin/cases/:id', requireMcqAdmin, (req: AuthRequest, res: Response) => {
  try {
    const caseData = getAdminCaseById(req.params.id);
    if (!caseData) {
      return res.status(404).json({ error: 'Case bundle not found.' });
    }
    return res.json({ case: caseData });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to load case bundle.' });
  }
});

// 12. Bulk Update Case Status (Publish / Draft)
router.post('/admin/cases/bulk-status', requireMcqAdmin, (req: AuthRequest, res: Response) => {
  try {
    const { ids, status } = req.body;
    if (!Array.isArray(ids) || !status) {
      return res.status(400).json({ error: 'Case IDs array and target status are required.' });
    }
    const result = bulkUpdateCaseStatus(ids, status);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to update case bundle status.' });
  }
});

// 13. Delete Case Bundle
router.delete('/admin/cases/:id', requireMcqAdmin, (req: AuthRequest, res: Response) => {
  try {
    const result = deleteAdminCase(req.params.id);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to delete case bundle.' });
  }
});

export default router;
