import { Router, Response } from 'express';
import crypto from 'node:crypto';
import { db } from '../db.js';
import { authenticateToken, AuthRequest, getStudentEntitlement } from '../auth.js';
import { validateAnswerSheetDocument, evaluateCAAnswerSheet } from '../gemini.js';
import { CALevel, MaterialType, CheckingMode, EvaluationResult } from '../../src/types/index.js';

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

    // Step B: Material Validation (Verify official ICAI reference material exists)
    const referenceMaterial = db.prepare(`
      SELECT * FROM evaluation_materials
      WHERE level = ? AND subject_key = ?
      ORDER BY created_at DESC LIMIT 1
    `).get(level, subjectKey) as {
      question_paper_title: string;
      question_paper_text: string;
      suggested_answers_text: string;
      marking_scheme_text: string;
    } | undefined;

    if (!referenceMaterial || !referenceMaterial.question_paper_text || !referenceMaterial.suggested_answers_text) {
      // STOP evaluation immediately without consuming any credit
      return res.status(400).json({
        error: 'Evaluation material is not uploaded yet. Please try again once the required material has been added.',
      });
    }

    // Step C: Initialize Evaluation Record with initial state
    db.prepare(`
      INSERT INTO evaluations (
        id, student_id, level, material_type, model_group, subject_key, subject_name, attempt,
        checking_mode, original_filename, status, document_validation_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PROCESSING', 'VALID')
    `).run(
      evaluationId,
      studentId,
      level,
      materialType,
      modelGroup || null,
      subjectKey,
      subjectName,
      attempt || 'May 2026',
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
    db.prepare(`
      UPDATE evaluations
      SET status = 'COMPLETED',
          confidence_score = ?,
          total_marks = ?,
          maximum_marks = ?,
          percentage = ?,
          grade = ?,
          result_json = ?,
          completed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      evaluationResult.confidenceScore,
      evaluationResult.totalMarks,
      evaluationResult.maximumMarks,
      evaluationResult.percentage,
      evaluationResult.grade,
      JSON.stringify(evaluationResult),
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
    const evaluationId = req.params.id;

    const record = db.prepare(`
      SELECT * FROM evaluations WHERE id = ? AND student_id = ?
    `).get(evaluationId, studentId) as {
      id: string;
      result_json?: string;
      [key: string]: unknown;
    } | undefined;

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
      },
    });
  } catch (error: unknown) {
    console.error('Get evaluation report error:', error);
    return res.status(500).json({ error: 'Failed to load report detail' });
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

// 7. Notifications
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

export default router;
