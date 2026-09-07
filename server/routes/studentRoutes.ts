import { Router, Response } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../db.js';
import { authenticateToken, AuthRequest, getStudentEntitlement } from '../auth.js';
import { validateAnswerSheetDocument, evaluateCAAnswerSheet } from '../gemini.js';
import { CALevel, MaterialType, CheckingMode, EvaluationResult } from '../../src/types/index.js';
import {
  generateCheckedCopyPdf,
  generateDetailedReportPdf,
  generateOriginalSubmissionPdf,
  buildStructuredAnnotations,
} from '../services/pdfCheckedCopyService.js';
import { PDFDocument } from 'pdf-lib';

const router = Router();

// Ensure all student routes require authentication
router.use(authenticateToken);

// 1. Student Dashboard Data
router.get('/dashboard', (req: AuthRequest, res: Response) => {
  try {
    const studentId = req.user!.id;
    const entitlement = getStudentEntitlement(studentId);

    // Profile info
    const profile = db.prepare(`
      SELECT p.*, i.name as institute_name, b.name as batch_name
      FROM student_profiles p
      LEFT JOIN institutes i ON i.id = p.institute_id
      LEFT JOIN batches b ON b.id = p.batch_id
      WHERE p.user_id = ?
    `).get(studentId) as Record<string, unknown> | undefined;

    // Evaluations summary
    const evaluations = db.prepare(`
      SELECT id, subject_name, level, material_type, total_marks, maximum_marks, percentage, grade,
             confidence_score, status, document_validation_status, created_at, completed_at
      FROM evaluations
      WHERE student_id = ?
      ORDER BY created_at DESC
    `).all(studentId) as Record<string, unknown>[];

    const completedEvals = evaluations.filter((e) => e.status === 'COMPLETED');
    const totalCount = completedEvals.length;

    let averageScore = 0;
    if (totalCount > 0) {
      const sumPercentage = completedEvals.reduce((acc, curr) => acc + (Number(curr.percentage) || 0), 0);
      averageScore = Math.round((sumPercentage / totalCount) * 10) / 10;
    }

    // Subject Performance breakdown
    const subjectStatsMap: Record<string, { total: number; count: number; maxTotal: number }> = {};
    for (const ev of completedEvals) {
      const sName = String(ev.subject_name || 'Other');
      if (!subjectStatsMap[sName]) {
        subjectStatsMap[sName] = { total: 0, count: 0, maxTotal: 0 };
      }
      subjectStatsMap[sName].total += Number(ev.total_marks) || 0;
      subjectStatsMap[sName].maxTotal += Number(ev.maximum_marks) || 100;
      subjectStatsMap[sName].count += 1;
    }

    const subjectPerformance = Object.entries(subjectStatsMap).map(([subject, stats]) => ({
      subject,
      evaluationsCount: stats.count,
      averagePercentage: Math.round((stats.total / stats.maxTotal) * 1000) / 10,
    }));

    // Weak & Strong topics extraction from recent evaluation results
    const recentEvalsWithResult = db.prepare(`
      SELECT result_json FROM evaluations
      WHERE student_id = ? AND status = 'COMPLETED' AND result_json IS NOT NULL
      ORDER BY created_at DESC LIMIT 5
    `).all(studentId) as { result_json: string }[];

    const weakTopicsSet = new Set<string>();
    const strongTopicsSet = new Set<string>();

    for (const row of recentEvalsWithResult) {
      try {
        const parsed = JSON.parse(row.result_json) as EvaluationResult;
        if (Array.isArray(parsed.topicPerformance)) {
          for (const tp of parsed.topicPerformance) {
            if (tp.status === 'WEAK' || tp.percentage < 45) {
              weakTopicsSet.add(tp.topic);
            } else if (tp.status === 'STRONG' || tp.percentage >= 65) {
              strongTopicsSet.add(tp.topic);
            }
          }
        }
      } catch {
        // ignore parse error
      }
    }

    // Pass probability estimate
    let passProbability = 'Building Baseline';
    if (totalCount >= 2) {
      if (averageScore >= 60) passProbability = 'High (Exemption Range)';
      else if (averageScore >= 45) passProbability = 'Moderate (Clearance Likely)';
      else passProbability = 'Needs Focus on Working Notes & Standards';
    }

    return res.json({
      entitlement,
      profile,
      metrics: {
        totalEvaluations: totalCount,
        freeEvaluationsRemaining: entitlement.freeEvaluationsRemaining,
        purchasedCredits: entitlement.purchasedCredits,
        instituteSponsored: entitlement.instituteSponsored,
        instituteName: entitlement.instituteName,
        averageScore,
        passProbability,
      },
      recentEvaluations: evaluations.slice(0, 5),
      subjectPerformance,
      strongTopics: Array.from(strongTopicsSet).slice(0, 6),
      weakTopics: Array.from(weakTopicsSet).slice(0, 6),
      improvementTrend: completedEvals
        .slice(0, 10)
        .reverse()
        .map((e) => ({
          date: new Date(String(e.created_at)).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
          subject: e.subject_name,
          score: e.percentage,
        })),
    });
  } catch (error: unknown) {
    console.error('Student dashboard error:', error);
    return res.status(500).json({ error: 'Failed to load dashboard data' });
  }
});

// 2. Upload and Evaluate Answer Sheet
router.post('/evaluate', async (req: AuthRequest, res: Response) => {
  const studentId = req.user!.id;
  const evaluationId = `eval_${crypto.randomBytes(8).toString('hex')}`;

  try {
    const {
      studentName,
      icaiRegistrationNumber,
      level,
      materialType,
      modelGroup,
      subjectKey,
      subjectName,
      attempt,
      checkingMode,
      fileBase64,
      mimeType,
      filename,
    } = req.body;

    if (!fileBase64 || !level || !materialType || !subjectKey || !subjectName) {
      return res.status(400).json({ error: 'Missing required evaluation parameters or answer sheet file.' });
    }

    // Step A: Entitlement Check
    const entitlement = getStudentEntitlement(studentId);
    if (!entitlement.canEvaluate) {
      return res.status(402).json({
        error: entitlement.reason || 'You have exhausted your free evaluations. Please purchase evaluation credits to continue.',
      });
    }

    // Step B: Material Validation (Verify active reference material exists)
    // CRITICAL EVALUATION SAFETY RULE: Exact matching on Level, Subject, Attempt, Paper, Material Type
    // STRICT MATERIAL OWNERSHIP (Rules 38, 55, 61): Only ADMIN uploaded & approved materials are used for global CA evaluations
    let materialQuery = `
      SELECT * FROM evaluation_materials
      WHERE level = ? AND subject_key = ? AND status = 'ACTIVE'
      AND source_type = 'ADMIN' AND admin_approved = 1
      AND question_paper_text IS NOT NULL AND length(trim(question_paper_text)) > 20
      AND suggested_answers_text IS NOT NULL AND length(trim(suggested_answers_text)) > 20
    `;
    const materialParams: any[] = [level, subjectKey];

    if (attempt && attempt !== 'Current' && attempt !== 'All') {
      materialQuery += " AND (attempt = ? OR attempt = 'All')";
      materialParams.push(attempt);
    }

    if (req.body.paper && req.body.paper !== 'All') {
      materialQuery += " AND (paper = ? OR paper = 'All')";
      materialParams.push(req.body.paper);
    }

    if (materialType && materialType !== 'ALL') {
      materialQuery += " AND (material_type = ? OR material_type = 'ALL')";
      materialParams.push(materialType);
    }

    materialQuery += ' ORDER BY created_at DESC LIMIT 1';
    const referenceMaterial = db.prepare(materialQuery).get(...materialParams) as {
      id: string;
      version: string;
      paper: string;
      syllabus_version: string;
      question_paper_title: string;
      question_paper_text: string;
      suggested_answers_text: string;
      marking_scheme_text: string;
      reference_guidance_text?: string;
      amendments_provisions_text?: string;
    } | undefined;

    if (!referenceMaterial || !referenceMaterial.question_paper_text || !referenceMaterial.suggested_answers_text) {
      // STOP evaluation immediately without consuming any credit
      return res.status(400).json({
        error: `Evaluation material is not available for the selected paper and attempt (${level} – ${subjectName} – ${attempt || 'Selected Attempt'}) yet. Please try again once the required material has been uploaded.`,
      });
    }

    // Save uploaded file to uploads directory for original & checked copy generation
    let pdfBuf = Buffer.from(fileBase64, 'base64');
    try {
      const uploadsDir = path.join(process.cwd(), 'uploads');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
      const rawBuf = pdfBuf;

      // If uploaded file is an image (PNG or JPG), wrap into a clean standard PDF
      const isPdf = rawBuf.length > 4 && rawBuf[0] === 0x25 && rawBuf[1] === 0x50 && rawBuf[2] === 0x44 && rawBuf[3] === 0x46; // %PDF
      if (!isPdf) {
        try {
          const doc = await PDFDocument.create();
          let img;
          if (rawBuf[0] === 0x89 && rawBuf[1] === 0x50) {
            img = await doc.embedPng(rawBuf);
          } else {
            img = await doc.embedJpg(rawBuf);
          }
          const page = doc.addPage([img.width, img.height]);
          page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
          const savedBytes = await doc.save();
          pdfBuf = Buffer.from(savedBytes);
        } catch (imgErr) {
          console.warn('Could not wrap image into PDF, saving raw buffer:', imgErr);
        }
      }

      const originalFilePath = path.join(uploadsDir, `${evaluationId}_original.pdf`);
      fs.writeFileSync(originalFilePath, pdfBuf);
    } catch (saveErr) {
      console.warn('Could not cache original file to disk:', saveErr);
    }

    // Fetch active evaluation settings
    const evalModelProviderRow = db.prepare("SELECT value FROM pricing_settings WHERE key = 'EVAL_MODEL_PROVIDER'").get() as { value: string } | undefined;
    const modelUsed = evalModelProviderRow?.value || 'gemini-3.8-flash';

    // Step C: Initialize Evaluation Record with initial state and material tracking
    db.prepare(`
      INSERT INTO evaluations (
        id, student_id, level, material_type, model_group, subject_key, subject_name,
        paper, attempt, syllabus_version, material_id, material_version, model_used,
        checking_mode, original_filename, status, document_validation_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PROCESSING', 'VALID')
    `).run(
      evaluationId,
      studentId,
      level,
      materialType,
      modelGroup || null,
      subjectKey,
      subjectName,
      referenceMaterial.paper || 'Paper 1',
      attempt || 'May 2026',
      referenceMaterial.syllabus_version || 'New Scheme 2024',
      referenceMaterial.id,
      referenceMaterial.version || '1.0',
      modelUsed,
      checkingMode || 'standard',
      filename || 'ca_answer_sheet.pdf'
    );

    // Step D: Document Validation (Verify it is a genuine student CA answer sheet)
    // Rejects admit cards, hall tickets, registration forms, certificates, blank files, etc.
    const docValidation = await validateAnswerSheetDocument(
      fileBase64,
      mimeType || 'application/pdf',
      filename || 'ca_answer_sheet.pdf'
    );

    if (!docValidation.isValidAnswerSheet) {
      const rejectReason = docValidation.rejectionReason || 'This file does not appear to be a valid CA answer sheet. Please upload your handwritten CA answer sheet.';
      db.prepare(`
        UPDATE evaluations
        SET status = 'REJECTED', document_validation_status = 'REJECTED', rejection_reason = ?, completed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(rejectReason, evaluationId);

      // CRITICAL: DO NOT CONSUME CREDITS OR FREE EVALUATIONS!
      return res.status(400).json({
        error: rejectReason,
        documentTypeDetected: docValidation.documentTypeDetected,
        isHandwritten: docValidation.isHandwritten,
      });
    }

    // Step E: Update State to READING_ANSWER_SHEET -> EVALUATING_ANSWERS
    db.prepare("UPDATE evaluations SET status = 'EVALUATING_ANSWERS' WHERE id = ?").run(evaluationId);

    // Step F: Execute Full AI Step Marking Evaluation
    const evaluationResult = await evaluateCAAnswerSheet({
      evaluationId,
      studentName: studentName || req.user!.fullName,
      icaiRegistrationNumber: icaiRegistrationNumber || 'N/A',
      level: level as CALevel,
      materialType: materialType as MaterialType,
      subjectKey,
      subjectName,
      attempt,
      checkingMode: (checkingMode as CheckingMode) || 'standard',
      fileBase64,
      mimeType: mimeType || 'application/pdf',
      referenceQuestionPaperText: referenceMaterial.question_paper_text,
      referenceSuggestedAnswersText: referenceMaterial.suggested_answers_text,
      markingSchemeText: referenceMaterial.marking_scheme_text || '',
    });

    // Step G: Finalize & Persist Evaluation
    // Pre-generate structured annotations & Checked Copy (Rules 69-89)
    let originalPageCount = 1;
    let checkedCopyStatus = 'PENDING';
    let structuredAnnotationsJson = '[]';

    try {
      const origDoc = await PDFDocument.load(pdfBuf, { ignoreEncryption: true });
      originalPageCount = origDoc.getPageCount();

      const meta = {
        id: evaluationId,
        studentName: studentName || req.user!.fullName,
        level: level as CALevel,
        subjectName,
        paper: referenceMaterial.paper || 'Paper 1',
        attempt: attempt || 'May 2026',
        checkingMode: (checkingMode as CheckingMode) || 'standard',
        totalMarks: evaluationResult.totalMarks,
        maximumMarks: evaluationResult.maximumMarks,
        percentage: evaluationResult.percentage,
        grade: evaluationResult.grade,
        createdAt: new Date().toISOString(),
      };

      const structuredAnn = buildStructuredAnnotations(meta, evaluationResult, originalPageCount);
      structuredAnnotationsJson = JSON.stringify(structuredAnn);

      const checkedPdfBuf = await generateCheckedCopyPdf(meta, evaluationResult, pdfBuf);
      const uploadsDir = path.join(process.cwd(), 'uploads');
      const checkedFilePath = path.join(uploadsDir, `${evaluationId}_checked_copy.pdf`);
      fs.writeFileSync(checkedFilePath, checkedPdfBuf);
      checkedCopyStatus = 'GENERATED';
    } catch (annErr) {
      console.warn('Could not pre-generate checked copy PDF in background:', annErr);
    }

    db.prepare(`
      UPDATE evaluations
      SET status = 'COMPLETED',
          confidence_score = ?,
          total_marks = ?,
          maximum_marks = ?,
          percentage = ?,
          grade = ?,
          result_json = ?,
          annotations_json = ?,
          original_page_count = ?,
          checked_copy_page_count = ?,
          checked_copy_status = ?,
          completed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      evaluationResult.confidenceScore,
      evaluationResult.totalMarks,
      evaluationResult.maximumMarks,
      evaluationResult.percentage,
      evaluationResult.grade,
      JSON.stringify(evaluationResult),
      structuredAnnotationsJson,
      originalPageCount,
      originalPageCount,
      checkedCopyStatus,
      evaluationId
    );

    // Step H: Consume Credit ONLY ON SUCCESS
    if (!entitlement.hasPermanentFreeAccess && !entitlement.instituteSponsored) {
      if (entitlement.tier === 'FREE_TIER') {
        db.prepare('UPDATE student_profiles SET free_evaluations_used = free_evaluations_used + 1 WHERE user_id = ?').run(studentId);
        // Ledger entry for free tier consumption
        db.prepare(`
          INSERT INTO credit_ledger (id, student_id, amount, source, balance_after, evaluation_id, note)
          VALUES (?, ?, -1, 'CONSUMED_EVALUATION', ?, ?, 'Consumed 1 free tier evaluation')
        `).run(
          `cld_${crypto.randomBytes(8).toString('hex')}`,
          studentId,
          Math.max(0, entitlement.freeEvaluationsRemaining - 1),
          evaluationId
        );
      } else if (entitlement.tier === 'PURCHASED_CREDITS') {
        db.prepare('UPDATE student_profiles SET purchased_credits = purchased_credits - 1 WHERE user_id = ?').run(studentId);
        db.prepare(`
          INSERT INTO credit_ledger (id, student_id, amount, source, balance_after, evaluation_id, note)
          VALUES (?, ?, -1, 'CONSUMED_EVALUATION', ?, ?, 'Consumed 1 purchased evaluation credit')
        `).run(
          `cld_${crypto.randomBytes(8).toString('hex')}`,
          studentId,
          entitlement.purchasedCredits - 1,
          evaluationId
        );
      }
    }

    // Notification
    db.prepare(`
      INSERT INTO notifications (id, user_id, title, message, type)
      VALUES (?, ?, ?, ?, 'EVALUATION')
    `).run(
      `notif_${crypto.randomBytes(8).toString('hex')}`,
      studentId,
      'Answer Sheet Evaluation Complete',
      `Your evaluation for ${subjectName} is complete. You scored ${evaluationResult.totalMarks}/${evaluationResult.maximumMarks} (${evaluationResult.percentage}%).`
    );

    return res.json({
      success: true,
      evaluationId,
      result: evaluationResult,
    });
  } catch (error: unknown) {
    console.error('Answer sheet evaluation error:', error);
    // Mark evaluation as failed, DO NOT consume credit
    const errMsg = error instanceof Error ? error.message : 'Evaluation processing failed. Please try again.';
    db.prepare(`
      UPDATE evaluations
      SET status = 'FAILED', error_message = ?, completed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(errMsg.slice(0, 500), evaluationId);

    const userFacingMsg = errMsg.includes('503') || errMsg.includes('high demand')
      ? 'The AI evaluation service is temporarily experiencing high demand. No credits were deducted. Please try submitting again in a moment.'
      : 'Evaluation encountered an issue. No credits or free evaluations were deducted. Please retry.';

    return res.status(500).json({
      error: userFacingMsg,
    });
  }
});

// 3. Get All Student Evaluations
router.get('/evaluations', (req: AuthRequest, res: Response) => {
  try {
    const studentId = req.user!.id;
    const { search, subject, status } = req.query;

    let query = `
      SELECT id, level, material_type, subject_key, subject_name, attempt, checking_mode,
             total_marks, maximum_marks, percentage, grade, confidence_score, status,
             rejection_reason, created_at, completed_at
      FROM evaluations
      WHERE student_id = ?
    `;
    const params: any[] = [studentId];

    if (subject) {
      query += ' AND subject_key = ?';
      params.push(subject);
    }
    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
    if (search) {
      query += ' AND (subject_name LIKE ? OR original_filename LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY created_at DESC';

    const records = db.prepare(query).all(...params);
    return res.json({ evaluations: records });
  } catch (error: unknown) {
    console.error('List evaluations error:', error);
    return res.status(500).json({ error: 'Failed to retrieve evaluations' });
  }
});

// 4. Get Specific Evaluation Report Detail
router.get('/evaluations/:id', (req: AuthRequest, res: Response) => {
  try {
    const studentId = req.user!.id;
    const userRole = req.user!.role;
    const evaluationId = req.params.id;

    let record: {
      id: string;
      result_json?: string;
      status?: string;
      error_message?: string;
      [key: string]: unknown;
    } | undefined;

    const roleStr = String(userRole);
    if (roleStr === 'SUPER_ADMIN' || roleStr === 'ADMIN') {
      record = db.prepare('SELECT * FROM evaluations WHERE id = ?').get(evaluationId) as any;
    } else if (roleStr === 'INSTITUTE_ADMIN' || roleStr === 'FACULTY') {
      record = db.prepare(`
        SELECT e.* FROM evaluations e
        LEFT JOIN student_profiles sp ON sp.user_id = e.student_id
        WHERE e.id = ? AND (e.student_id = ? OR sp.institute_id = ?)
      `).get(evaluationId, studentId, (req.user as any)?.instituteId || '') as any;
    } else {
      record = db.prepare(`
        SELECT * FROM evaluations WHERE id = ? AND student_id = ?
      `).get(evaluationId, studentId) as any;
    }

    if (!record) {
      return res.status(404).json({ error: 'Evaluation report not found.' });
    }

    let resultJson: EvaluationResult | null = null;
    if (record.result_json) {
      try {
        resultJson = JSON.parse(record.result_json);
      } catch {
        // ignore
      }
    }

    return res.json({
      evaluation: {
        ...record,
        resultJson,
        raw_result_json: record.result_json,
      },
    });
  } catch (error: unknown) {
    console.error('Get evaluation report error:', error);
    return res.status(500).json({ error: 'Failed to load report detail' });
  }
});

// 4a. Download Checked Copy (Annotated Student Answer Sheet with Examiner Marks)
router.get(
  ['/evaluations/:id/download-checked-copy', '/evaluations/:id/download-checked', '/evaluations/:id/checked-copy/download'],
  async (req: AuthRequest, res: Response) => {
    try {
      const studentId = req.user!.id;
      const userRole = req.user!.role;
      const evaluationId = req.params.id;

      let record: any;
      const roleStr = String(userRole);
      if (roleStr === 'SUPER_ADMIN' || roleStr === 'ADMIN') {
        record = db.prepare('SELECT * FROM evaluations WHERE id = ?').get(evaluationId);
      } else {
        record = db.prepare('SELECT * FROM evaluations WHERE id = ? AND student_id = ?').get(evaluationId, studentId);
      }

      if (!record) {
        return res.status(404).json({ error: 'Evaluation not found' });
      }

      const uploadsDir = path.join(process.cwd(), 'uploads');
      const checkedFilePath = path.join(uploadsDir, `${evaluationId}_checked_copy.pdf`);

      // If pre-generated checked copy is already cached on disk, serve directly
      if (fs.existsSync(checkedFilePath)) {
        const cachedCheckedBuffer = fs.readFileSync(checkedFilePath);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Checked_Copy_${evaluationId}.pdf"`);
        return res.send(cachedCheckedBuffer);
      }

      let resultJson: any = null;
      if (record.result_json) {
        try {
          resultJson = JSON.parse(record.result_json);
        } catch {
          // ignore
        }
      }

      const originalFilePath = path.join(uploadsDir, `${evaluationId}_original.pdf`);
      let originalPdfBuffer: Buffer | undefined;
      if (fs.existsSync(originalFilePath)) {
        originalPdfBuffer = fs.readFileSync(originalFilePath);
      } else {
        // If original PDF is not on disk (e.g. server restart), dynamically generate candidate submission sheets
        const studentRowForCopy = db.prepare('SELECT full_name FROM users WHERE id = ?').get(record.student_id) as any;
        originalPdfBuffer = await generateOriginalSubmissionPdf(
          {
            id: record.id,
            studentName: studentRowForCopy?.full_name || 'CA Student',
            level: record.level,
            subjectName: record.subject_name,
            paper: record.paper,
            attempt: record.attempt,
            checkingMode: record.checking_mode,
            totalMarks: record.total_marks,
            maximumMarks: record.maximum_marks,
            percentage: record.percentage,
            grade: record.grade,
            createdAt: record.created_at,
          },
          resultJson
        );
        try {
          if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
          fs.writeFileSync(originalFilePath, originalPdfBuffer);
        } catch {
          // ignore
        }
      }

      const studentRow = db.prepare('SELECT full_name FROM users WHERE id = ?').get(record.student_id) as any;

      const checkedCopyBuffer = await generateCheckedCopyPdf(
        {
          id: record.id,
          studentName: studentRow?.full_name || 'CA Student',
          level: record.level,
          subjectName: record.subject_name,
          paper: record.paper,
          attempt: record.attempt,
          checkingMode: record.checking_mode,
          totalMarks: record.total_marks,
          maximumMarks: record.maximum_marks,
          percentage: record.percentage,
          grade: record.grade,
          createdAt: record.created_at,
        },
        resultJson,
        originalPdfBuffer
      );

      // Cache on disk
      try {
        if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
        fs.writeFileSync(checkedFilePath, checkedCopyBuffer);
      } catch {
        // ignore
      }

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="Checked_Copy_${evaluationId}.pdf"`);
      return res.send(checkedCopyBuffer);
    } catch (error: unknown) {
      console.error('Download checked copy error:', error);
      return res.status(500).json({ error: 'Failed to generate checked copy PDF' });
    }
  }
);

// 4b. Download Comprehensive Detailed Report PDF
router.get(
  ['/evaluations/:id/download-report', '/evaluations/:id/report/download'],
  async (req: AuthRequest, res: Response) => {
    try {
      const studentId = req.user!.id;
      const userRole = req.user!.role;
      const evaluationId = req.params.id;

      let record: any;
      const roleStr = String(userRole);
      if (roleStr === 'SUPER_ADMIN' || roleStr === 'ADMIN') {
        record = db.prepare('SELECT * FROM evaluations WHERE id = ?').get(evaluationId);
      } else {
        record = db.prepare('SELECT * FROM evaluations WHERE id = ? AND student_id = ?').get(evaluationId, studentId);
      }

      if (!record) {
        return res.status(404).json({ error: 'Evaluation not found' });
      }

      let resultJson: any = null;
      if (record.result_json) {
        try {
          resultJson = JSON.parse(record.result_json);
        } catch {
          // ignore
        }
      }

      const studentRow = db.prepare('SELECT full_name FROM users WHERE id = ?').get(record.student_id) as any;

      const reportBuffer = await generateDetailedReportPdf(
        {
          id: record.id,
          studentName: studentRow?.full_name || 'CA Student',
          level: record.level,
          subjectName: record.subject_name,
          paper: record.paper,
          attempt: record.attempt,
          checkingMode: record.checking_mode,
          totalMarks: record.total_marks,
          maximumMarks: record.maximum_marks,
          percentage: record.percentage,
          grade: record.grade,
          createdAt: record.created_at,
        },
        resultJson
      );

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="Evaluation_Report_${evaluationId}.pdf"`);
      return res.send(reportBuffer);
    } catch (error: unknown) {
      console.error('Download report error:', error);
      return res.status(500).json({ error: 'Failed to generate detailed report PDF' });
    }
  }
);

// 4c. Download Original Student Answer Sheet
router.get(
  ['/evaluations/:id/download-original', '/evaluations/:id/original/download'],
  async (req: AuthRequest, res: Response) => {
  try {
    const studentId = req.user!.id;
    const userRole = req.user!.role;
    const evaluationId = req.params.id;

    let record: any;
    const roleStr = String(userRole);
    if (roleStr === 'SUPER_ADMIN' || roleStr === 'ADMIN') {
      record = db.prepare('SELECT * FROM evaluations WHERE id = ?').get(evaluationId);
    } else {
      record = db.prepare('SELECT * FROM evaluations WHERE id = ? AND student_id = ?').get(evaluationId, studentId);
    }

    if (!record) {
      return res.status(404).json({ error: 'Evaluation not found' });
    }

    const uploadsDir = path.join(process.cwd(), 'uploads');
    const originalFilePath = path.join(uploadsDir, `${evaluationId}_original.pdf`);

    if (fs.existsSync(originalFilePath)) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${record.original_filename || `Original_${evaluationId}.pdf`}"`);
      return res.sendFile(originalFilePath);
    }

    // Check if alternate image file format exists
    const possibleExts = ['.png', '.jpg', '.jpeg'];
    for (const ext of possibleExts) {
      const imgPath = path.join(uploadsDir, `${evaluationId}_original${ext}`);
      if (fs.existsSync(imgPath)) {
        res.setHeader('Content-Type', ext === '.png' ? 'image/png' : 'image/jpeg');
        res.setHeader('Content-Disposition', `attachment; filename="${record.original_filename || `Original_${evaluationId}${ext}`}"`);
        return res.sendFile(imgPath);
      }
    }

    // Graceful fallback: If original file was not on disk (e.g. server restart or test evaluations),
    // dynamically generate an authentic ICAI candidate submission answer booklet archive PDF
    let resultJson: any = null;
    if (record.result_json) {
      try {
        resultJson = JSON.parse(record.result_json);
      } catch {
        // ignore
      }
    }

    const studentRow = db.prepare('SELECT full_name FROM users WHERE id = ?').get(record.student_id) as any;

    const originalPdfBuffer = await generateOriginalSubmissionPdf(
      {
        id: record.id,
        studentName: studentRow?.full_name || 'CA Student',
        level: record.level,
        subjectName: record.subject_name,
        paper: record.paper,
        attempt: record.attempt,
        checkingMode: record.checking_mode,
        totalMarks: record.total_marks,
        maximumMarks: record.maximum_marks,
        percentage: record.percentage,
        grade: record.grade,
        createdAt: record.created_at,
      },
      resultJson
    );

    // Cache file to disk for instant subsequent downloads
    try {
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
      fs.writeFileSync(originalFilePath, originalPdfBuffer);
    } catch {
      // ignore
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${record.original_filename || `Original_${evaluationId}.pdf`}"`);
    return res.send(originalPdfBuffer);
  } catch (error: unknown) {
    console.error('Download original error:', error);
    return res.status(500).json({ error: 'Failed to download original answer sheet' });
  }
});

// 5. Get Credit Ledger & Balances
router.get('/credits', (req: AuthRequest, res: Response) => {
  try {
    const studentId = req.user!.id;
    const entitlement = getStudentEntitlement(studentId);

    const ledger = db.prepare(`
      SELECT id, amount, source, balance_after, order_id, payment_id, evaluation_id, note, created_at
      FROM credit_ledger
      WHERE student_id = ?
      ORDER BY created_at DESC
      LIMIT 100
    `).all(studentId);

    return res.json({
      entitlement,
      ledger,
    });
  } catch (error: unknown) {
    console.error('Get credits error:', error);
    return res.status(500).json({ error: 'Failed to load credits history' });
  }
});

// 6. Update Student Profile
router.put('/profile', (req: AuthRequest, res: Response) => {
  try {
    const studentId = req.user!.id;
    const { icaiRegistrationNumber, phone, caLevel, fullName } = req.body;

    if (fullName) {
      db.prepare('UPDATE users SET full_name = ?, phone = ? WHERE id = ?').run(
        fullName.trim(),
        phone?.trim() || null,
        studentId
      );
    }

    if (icaiRegistrationNumber || caLevel) {
      db.prepare(`
        UPDATE student_profiles
        SET icai_registration_number = COALESCE(?, icai_registration_number),
            ca_level = COALESCE(?, ca_level)
        WHERE user_id = ?
      `).run(
        icaiRegistrationNumber ? icaiRegistrationNumber.trim().toUpperCase() : null,
        caLevel || null,
        studentId
      );
    }

    return res.json({ success: true, message: 'Profile updated successfully' });
  } catch (error: unknown) {
    console.error('Update profile error:', error);
    return res.status(500).json({ error: 'Failed to update profile' });
  }
});

// 7. Referral Code Redemption (e.g. AI30)
router.post('/referral/redeem', (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const userEmail = req.user!.email;
    const { code } = req.body;

    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'Please enter a valid referral code.' });
    }

    const cleanCode = code.trim().toUpperCase();

    // Check campaign
    const campaign = db.prepare(`
      SELECT * FROM referral_campaigns WHERE code = ? AND is_active = 1
    `).get(cleanCode) as {
      code: string;
      campaign_name: string;
      benefit_type: string;
      benefit_duration_days: number;
      max_redemptions: number;
    } | undefined;

    if (!campaign) {
      return res.status(404).json({ error: `Referral code "${cleanCode}" is invalid or has expired.` });
    }

    // Check if user already redeemed this code
    const alreadyRedeemed = db.prepare(`
      SELECT id, redeemed_at, expiry_date FROM referral_redemptions WHERE referral_code = ? AND user_id = ?
    `).get(cleanCode, userId) as { id: string; redeemed_at: string; expiry_date: string } | undefined;

    if (alreadyRedeemed) {
      return res.status(400).json({
        error: `You have already redeemed referral code "${cleanCode}". Benefit is active until ${new Date(alreadyRedeemed.expiry_date).toLocaleDateString()}.`,
      });
    }

    // Check total redemptions cap (e.g. 20 users for AI30)
    const countRow = db.prepare(`
      SELECT COUNT(*) as total FROM referral_redemptions WHERE referral_code = ?
    `).get(cleanCode) as { total: number };

    if (countRow.total >= campaign.max_redemptions) {
      return res.status(400).json({
        error: `Referral code "${cleanCode}" has reached its maximum quota of ${campaign.max_redemptions} eligible students.`,
      });
    }

    const redemptionNumber = countRow.total + 1;
    const redemptionId = `red_${crypto.randomBytes(8).toString('hex')}`;
    const expiryDate = new Date(Date.now() + campaign.benefit_duration_days * 24 * 60 * 60 * 1000).toISOString();

    db.prepare(`
      INSERT INTO referral_redemptions (
        id, referral_code, user_id, user_email, benefit_type,
        redemption_number, expiry_date, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
    `).run(
      redemptionId,
      cleanCode,
      userId,
      userEmail,
      campaign.benefit_type,
      redemptionNumber,
      expiryDate
    );

    // Create notification
    db.prepare(`
      INSERT INTO notifications (id, user_id, title, message, type)
      VALUES (?, ?, ?, ?, 'SYSTEM')
    `).run(
      `notif_${crypto.randomBytes(8).toString('hex')}`,
      userId,
      `Referral Code ${cleanCode} Activated!`,
      `Congratulations! You have unlocked 1-Month Free Access to CA Exam Checker AI (active until ${new Date(expiryDate).toLocaleDateString()}). You were redemption #${redemptionNumber} of ${campaign.max_redemptions}.`
    );

    return res.json({
      success: true,
      message: `Referral code ${cleanCode} redeemed successfully! You have unlocked 1-Month Free CA Evaluation Access.`,
      expiryDate,
      redemptionNumber,
      maxRedemptions: campaign.max_redemptions,
    });
  } catch (error: unknown) {
    console.error('Referral redeem error:', error);
    return res.status(500).json({ error: 'Failed to redeem referral code' });
  }
});

router.get('/referral/status', (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const redemptions = db.prepare(`
      SELECT r.*, c.campaign_name, c.benefit_duration_days, c.max_redemptions
      FROM referral_redemptions r
      LEFT JOIN referral_campaigns c ON c.code = r.referral_code
      WHERE r.user_id = ?
      ORDER BY r.redeemed_at DESC
    `).all(userId);

    // Overall campaign info for AI30
    const ai30Campaign = db.prepare('SELECT * FROM referral_campaigns WHERE code = "AI30"').get() as any;
    const ai30RedemptionsCount = (db.prepare('SELECT COUNT(*) as cnt FROM referral_redemptions WHERE referral_code = "AI30"').get() as any)?.cnt || 0;

    return res.json({
      redemptions,
      ai30Campaign: ai30Campaign ? {
        ...ai30Campaign,
        usedRedemptions: ai30RedemptionsCount,
        remainingSlots: Math.max(0, (ai30Campaign.max_redemptions || 20) - ai30RedemptionsCount),
      } : null,
    });
  } catch (error: unknown) {
    console.error('Referral status error:', error);
    return res.status(500).json({ error: 'Failed to get referral status' });
  }
});

// 8. Student Support Tickets
router.get('/tickets', (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const tickets = db.prepare(`
      SELECT * FROM support_tickets WHERE user_id = ? ORDER BY created_at DESC
    `).all(userId);
    return res.json({ tickets });
  } catch (error: unknown) {
    console.error('List tickets error:', error);
    return res.status(500).json({ error: 'Failed to load support tickets' });
  }
});

router.post('/tickets', (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const { subject, message, category, priority, evaluationId } = req.body;

    if (!subject || !message) {
      return res.status(400).json({ error: 'Subject and message are required.' });
    }

    const ticketId = `tkt_${crypto.randomBytes(8).toString('hex')}`;
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const ticketNumber = `CEC-${randomNum}`;

    db.prepare(`
      INSERT INTO support_tickets (
        id, ticket_number, user_id, name, email, subject, message,
        category, priority, role, evaluation_id, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'STUDENT', ?, 'OPEN')
    `).run(
      ticketId,
      ticketNumber,
      user.id,
      user.fullName,
      user.email,
      subject.trim(),
      message.trim(),
      category || 'EVALUATION_QUERY',
      priority || 'MEDIUM',
      evaluationId || null
    );

    // Confirmation notification to user
    db.prepare(`
      INSERT INTO notifications (id, user_id, title, message, type)
      VALUES (?, ?, ?, ?, 'SYSTEM')
    `).run(
      `notif_${crypto.randomBytes(8).toString('hex')}`,
      user.id,
      `Support Ticket Raised (#${ticketNumber})`,
      `Your support ticket regarding "${subject}" has been received. Our examination support team will respond shortly.`
    );

    return res.json({
      success: true,
      ticketId,
      ticketNumber,
      message: 'Support ticket submitted successfully.',
    });
  } catch (error: unknown) {
    console.error('Create ticket error:', error);
    return res.status(500).json({ error: 'Failed to submit support ticket' });
  }
});

// 9. Notifications
router.get('/notifications', (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const notifications = db.prepare(`
      SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50
    `).all(userId);
    return res.json({ notifications });
  } catch (error: unknown) {
    console.error('Notifications error:', error);
    return res.status(500).json({ error: 'Failed to load notifications' });
  }
});

router.put('/notifications/:id/read', (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    db.prepare('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?').run(req.params.id, userId);
    return res.json({ success: true });
  } catch (error: unknown) {
    console.error('Notification read error:', error);
    return res.status(500).json({ error: 'Failed to mark notification read' });
  }
});

router.put('/notifications/read-all', (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').run(userId);
    return res.json({ success: true });
  } catch (error: unknown) {
    console.error('Mark all read error:', error);
    return res.status(500).json({ error: 'Failed to mark all notifications read' });
  }
});

// 10. Institute Assigned Tests for Students (Rule 42-47)
router.get(['/institute/my-tests', '/institute-tests/my-tests'], (req: AuthRequest, res: Response) => {
  try {
    const studentId = req.user!.id;

    // Check student profile and active institute membership
    const profile = db.prepare('SELECT institute_id, batch_id FROM student_profiles WHERE user_id = ?').get(studentId) as any;
    const membership = db.prepare('SELECT institute_id, batch_id FROM institute_memberships WHERE student_id = ? AND status = "ACTIVE" LIMIT 1').get(studentId) as any;

    const instituteId = profile?.institute_id || membership?.institute_id;
    const batchId = profile?.batch_id || membership?.batch_id;

    if (!instituteId) {
      return res.json({ tests: [], message: 'Student is not currently enrolled in any coaching institute.' });
    }

    const institute = db.prepare('SELECT id, name, code FROM institutes WHERE id = ?').get(instituteId) as any;

    // Fetch tests assigned to all students or to the student's specific batch
    const tests = db.prepare(`
      SELECT t.*, m.title as material_title, m.paper_number as material_paper, m.total_marks as material_marks
      FROM institute_tests t
      LEFT JOIN institute_materials m ON m.id = t.material_id
      WHERE t.institute_id = ? AND t.status = 'PUBLISHED'
      AND (
        t.target_audience = 'ALL'
        OR (t.target_audience = 'BATCH' AND t.assigned_batch_id = ?)
      )
      ORDER BY t.created_at DESC
    `).all(instituteId, batchId || '') as any[];

    // Enrich with student's evaluation status for each test
    const enrichedTests = tests.map((t) => {
      const existingEval = db.prepare(`
        SELECT id, status, total_marks, maximum_marks, percentage, grade, completed_at
        FROM evaluations
        WHERE student_id = ? AND material_id = ?
        ORDER BY created_at DESC LIMIT 1
      `).get(studentId, t.id) as any;

      return {
        ...t,
        instituteName: institute?.name || 'Partner Institute',
        submission: existingEval || null,
      };
    });

    return res.json({
      tests: enrichedTests,
      institute: institute || null,
    });
  } catch (error: unknown) {
    console.error('Institute tests for student error:', error);
    return res.status(500).json({ error: 'Failed to fetch institute tests' });
  }
});

router.post(['/institute/tests/:id/submit', '/institute-tests/:id/submit'], async (req: AuthRequest, res: Response) => {
  try {
    const studentId = req.user!.id;
    const studentName = req.user!.fullName;
    const testId = req.params.id;
    const { fileBase64, mimeType, checkingMode } = req.body;

    if (!fileBase64) {
      return res.status(400).json({ error: 'Student answer sheet file is required.' });
    }

    // Verify test exists and is published
    const test = db.prepare(`
      SELECT t.*, i.name as institute_name,
             m.question_paper_text, m.suggested_answers_text, m.marking_scheme_text
      FROM institute_tests t
      JOIN institutes i ON i.id = t.institute_id
      LEFT JOIN institute_materials m ON m.id = t.material_id
      WHERE t.id = ? AND t.status = 'PUBLISHED'
    `).get(testId) as any;

    if (!test) {
      return res.status(404).json({ error: 'Institute test not found or is no longer published.' });
    }

    if (!test.question_paper_text || !test.suggested_answers_text) {
      return res.status(400).json({
        error: 'Evaluation reference material for this institute test is incomplete. Please contact your institute coordinator.',
      });
    }

    // Save uploaded file to uploads directory
    const uploadsDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    const rawBuf = Buffer.from(fileBase64, 'base64');
    let pdfBuf = rawBuf;

    const evaluationId = `eval_${crypto.randomBytes(8).toString('hex')}`;
    const originalFilePath = path.join(uploadsDir, `${evaluationId}_original.pdf`);
    fs.writeFileSync(originalFilePath, pdfBuf);

    // Initial evaluation record (100% Institute Sponsored, zero student credit deduction)
    db.prepare(`
      INSERT INTO evaluations (
        id, student_id, institute_id, material_id, subject_name, level, material_type,
        paper, attempt, checking_mode, status, document_validation_status
      ) VALUES (?, ?, ?, ?, ?, ?, 'MOCK_EXAM', ?, 'Institute Series', ?, 'PROCESSING', 'VERIFIED')
    `).run(
      evaluationId,
      studentId,
      test.institute_id,
      test.id,
      test.title,
      test.level,
      'Institute Paper',
      (checkingMode as CheckingMode) || 'standard'
    );

    // Student profile
    const studentProfile = db.prepare('SELECT icai_registration_number FROM student_profiles WHERE user_id = ?').get(studentId) as any;
    const icaiReg = studentProfile?.icai_registration_number || 'N/A';

    // Evaluate with Gemini
    const evaluationResult = await evaluateCAAnswerSheet({
      evaluationId,
      studentName,
      icaiRegistrationNumber: icaiReg,
      level: test.level as CALevel,
      subjectKey: test.title.toLowerCase().replace(/[^a-z0-9]/g, '_'),
      subjectName: test.title,
      materialType: 'MTP' as MaterialType,
      attempt: 'Institute Series',
      checkingMode: (checkingMode as CheckingMode) || 'standard',
      fileBase64,
      mimeType: mimeType || 'application/pdf',
      referenceQuestionPaperText: test.question_paper_text,
      referenceSuggestedAnswersText: test.suggested_answers_text,
      markingSchemeText: test.marking_scheme_text || '',
    });

    // Generate annotations and pre-generate Checked Copy
    let originalPageCount = 1;
    let checkedCopyStatus = 'PENDING';
    let structuredAnnotationsJson = '[]';

    try {
      const origDoc = await PDFDocument.load(pdfBuf, { ignoreEncryption: true });
      originalPageCount = origDoc.getPageCount();

      const meta = {
        id: evaluationId,
        studentName,
        level: test.level as CALevel,
        subjectName: test.title,
        paper: 'Institute Paper',
        attempt: 'Institute Series',
        checkingMode: (checkingMode as CheckingMode) || 'standard',
        totalMarks: evaluationResult.totalMarks,
        maximumMarks: evaluationResult.maximumMarks,
        percentage: evaluationResult.percentage,
        grade: evaluationResult.grade,
        createdAt: new Date().toISOString(),
      };

      const structuredAnn = buildStructuredAnnotations(meta, evaluationResult, originalPageCount);
      structuredAnnotationsJson = JSON.stringify(structuredAnn);

      const checkedPdfBuf = await generateCheckedCopyPdf(meta, evaluationResult, pdfBuf);
      const checkedFilePath = path.join(uploadsDir, `${evaluationId}_checked_copy.pdf`);
      fs.writeFileSync(checkedFilePath, checkedPdfBuf);
      checkedCopyStatus = 'GENERATED';
    } catch (annErr) {
      console.warn('Could not pre-generate checked copy for institute test:', annErr);
    }

    // Persist final result
    db.prepare(`
      UPDATE evaluations
      SET status = 'COMPLETED',
          confidence_score = ?,
          total_marks = ?,
          maximum_marks = ?,
          percentage = ?,
          grade = ?,
          result_json = ?,
          annotations_json = ?,
          original_page_count = ?,
          checked_copy_page_count = ?,
          checked_copy_status = ?,
          completed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      evaluationResult.confidenceScore,
      evaluationResult.totalMarks,
      evaluationResult.maximumMarks,
      evaluationResult.percentage,
      evaluationResult.grade,
      JSON.stringify(evaluationResult),
      structuredAnnotationsJson,
      originalPageCount,
      originalPageCount,
      checkedCopyStatus,
      evaluationId
    );

    // Notification
    db.prepare(`
      INSERT INTO notifications (id, user_id, title, message, type)
      VALUES (?, ?, ?, ?, 'EVALUATION')
    `).run(
      `notif_${crypto.randomBytes(8).toString('hex')}`,
      studentId,
      'Institute Test Evaluation Complete',
      `Your submission for "${test.title}" has been evaluated. You scored ${evaluationResult.totalMarks}/${evaluationResult.maximumMarks} (${evaluationResult.percentage}%).`
    );

    return res.json({
      success: true,
      evaluationId,
      result: evaluationResult,
    });
  } catch (error: unknown) {
    console.error('Submit institute test error:', error);
    const errMsg = error instanceof Error ? error.message : 'Evaluation processing failed.';
    return res.status(500).json({ error: errMsg });
  }
});

export default router;
