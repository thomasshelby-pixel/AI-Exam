import { Router, Request, Response } from 'express';
import crypto from 'node:crypto';
import { db } from '../db.js';
import { getValidAttemptsForLevel } from '../services/attemptService.js';

const router = Router();

// Pricing Information
router.get('/pricing', (req: Request, res: Response) => {
  const priceSettings = db.prepare('SELECT key, value FROM pricing_settings').all() as { key: string; value: string }[];
  const settingsMap = Object.fromEntries(priceSettings.map((s) => [s.key, s.value]));

  const pricePerCreditINR = Number(settingsMap.PRICE_PER_CREDIT_INR) || 10;
  const freeTierEvaluations = Number(settingsMap.FREE_TIER_EVALUATIONS) || 2;

  // Load active Institute Plans from database
  let institutePlans: any[] = [];
  try {
    const rawInstPlans = db.prepare(`
      SELECT * FROM institute_plans WHERE is_active = 1 ORDER BY sort_order ASC
    `).all() as any[];
    institutePlans = rawInstPlans.map((p) => ({
      ...p,
      features: JSON.parse(p.features_json || '[]'),
    }));
  } catch (err) {
    console.warn('Load institute plans warning:', err);
  }

  const plans = [
    {
      id: 'free_starter',
      name: 'Free Trial',
      priceINR: 0,
      credits: freeTierEvaluations,
      description: 'Ideal for trying your first two CA exam answer sheets',
      features: [
        '2 Full-Length Answer Sheet Evaluations',
        'Examiner-Grade Step-Marking Breakdown',
        'Question-wise feedback and provisions analysis',
        'Detailed PDF performance report',
        'No credit card required',
      ],
      popular: false,
    },
    {
      id: 'standard_bundle',
      name: 'Standard Practice Pack',
      priceINR: 100,
      credits: 10,
      pricePerPaper: 10,
      description: 'Most popular among CA Inter & Final students for complete mock series',
      features: [
        '10 Full-Length Answer Sheet Evaluations',
        '₹10 per evaluated paper',
        'Zero negative marking on Inter & Final MCQs',
        'Comprehensive Working Notes and AS/Ind AS checks',
        'Detailed strengths and weaknesses breakdown',
        'Instant re-checking and score tracking',
      ],
      popular: true,
    },
    {
      id: 'comprehensive_pack',
      name: 'Exemption Master Pack',
      priceINR: 200,
      credits: 22,
      pricePerPaper: 9.09,
      description: 'Best value for dual group candidates attempting complete test series',
      features: [
        '22 Full-Length Answer Sheet Evaluations (2 bonus credits)',
        'Detailed analysis across Group 1 & Group 2',
        'Head Examiner mode evaluation option',
        'Permanent history & trend analytics',
        'Priority evaluation queue',
      ],
      popular: false,
    },
  ];

  return res.json({
    pricePerCreditINR,
    freeTierEvaluations,
    supportEmail: settingsMap.SUPPORT_EMAIL || 'caexamchecker.support@gmail.com',
    instagramUrl: settingsMap.INSTAGRAM_URL || 'https://insta.openinapp.co/utw2r',
    plans,
    institutePlans,
  });
});

// Dynamic Centralized ICAI Exam Attempts lookup from Master Database
router.get('/attempts', (req: Request, res: Response) => {
  try {
    const { course, level, includeInactive } = req.query;
    const targetLevel = (level || course || '').toString().toUpperCase();
    const activeOnly = includeInactive !== 'true';

    const attempts = getValidAttemptsForLevel(targetLevel || undefined, activeOnly);

    return res.json({
      attempts: attempts.map((a) => ({
        id: a.id,
        caLevel: a.caLevel,
        attemptLabel: a.attemptLabel,
        attemptCode: a.attemptCode,
        examMonth: a.examMonth,
        examYear: a.examYear,
        sequenceOrder: a.sequenceOrder,
        active: a.active,
        syllabusVersion: a.syllabusVersion,
        applicableMaterialVersion: a.applicableMaterialVersion || '1.0',
        // Legacy backward-compatibility aliases:
        course: a.caLevel,
        month: a.examMonth,
        year: a.examYear,
        displayName: a.attemptLabel,
        isActive: a.active,
      })),
    });
  } catch (error: unknown) {
    console.error('Get attempts error:', error);
    return res.status(500).json({ error: 'Failed to retrieve exam attempts' });
  }
});

// Institute Pricing Plans
router.get('/institute-plans', (req: Request, res: Response) => {
  try {
    const rawPlans = db.prepare(`
      SELECT * FROM institute_plans WHERE is_active = 1 ORDER BY sort_order ASC
    `).all() as any[];

    const plans = rawPlans.map((p) => ({
      id: p.id,
      name: p.name,
      priceInr: p.price_inr,
      billingPeriod: p.billing_period,
      studentQuota: p.student_quota,
      evaluationCredits: p.evaluation_credits,
      features: JSON.parse(p.features_json || '[]'),
      assignmentsEnabled: Boolean(p.assignments_enabled),
      testsEnabled: Boolean(p.tests_enabled),
      analyticsEnabled: Boolean(p.analytics_enabled),
      supportTier: p.support_tier,
      isActive: Boolean(p.is_active),
      sortOrder: p.sort_order,
    }));

    return res.json({ plans });
  } catch (error: unknown) {
    console.error('Get institute plans error:', error);
    return res.status(500).json({ error: 'Failed to retrieve institute plans' });
  }
});

// Referral Code Validation (e.g. AI30)
router.post('/referral/validate', (req: Request, res: Response) => {
  try {
    const { code } = req.body;
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'Please enter a referral code.' });
    }

    const cleanCode = code.trim().toUpperCase();
    const campaign = db.prepare(`
      SELECT * FROM referral_campaigns WHERE code = ? AND is_active = 1
    `).get(cleanCode) as any;

    if (!campaign) {
      return res.status(404).json({
        valid: false,
        error: `Promo code "${cleanCode}" is not recognized or has expired.`,
      });
    }

    const countRow = db.prepare(`
      SELECT COUNT(*) as total
      FROM referral_redemptions r
      LEFT JOIN users u ON u.id = r.user_id
      WHERE UPPER(r.referral_code) = UPPER(?)
        AND (u.account_classification IS NULL OR u.account_classification != 'TEST')
    `).get(cleanCode) as { total: number };

    const remainingSlots = Math.max(0, campaign.max_redemptions - countRow.total);
    if (remainingSlots <= 0) {
      return res.status(400).json({
        valid: false,
        error: `Promo code "${cleanCode}" has reached its maximum quota of ${campaign.max_redemptions} redemptions.`,
      });
    }

    return res.json({
      valid: true,
      code: cleanCode,
      campaignName: campaign.campaign_name,
      benefitDurationDays: campaign.benefit_duration_days,
      remainingSlots,
      maxRedemptions: campaign.max_redemptions,
      message: `Valid code! Unlocks ${campaign.benefit_duration_days} days of free evaluation access (${remainingSlots} slots left).`,
    });
  } catch (error: unknown) {
    console.error('Validate referral error:', error);
    return res.status(500).json({ error: 'Failed to validate referral code' });
  }
});

// Check whether reference material exists for a given subject, paper, and attempt
router.get('/materials-check', (req: Request, res: Response) => {
  const { level, subjectKey, attempt, paper, materialType } = req.query;
  if (!level || !subjectKey) {
    return res.status(400).json({ error: 'Level and subjectKey are required.' });
  }

  let query = `
    SELECT id, question_paper_title, attempt, paper, material_type
    FROM evaluation_materials
    WHERE level = ? AND subject_key = ? AND status = 'ACTIVE'
    AND question_paper_text IS NOT NULL AND length(trim(question_paper_text)) > 20
    AND suggested_answers_text IS NOT NULL AND length(trim(suggested_answers_text)) > 20
  `;
  const params: any[] = [String(level), String(subjectKey)];

  if (attempt && attempt !== 'Current' && attempt !== 'All') {
    query += " AND (attempt = ? OR attempt = 'All')";
    params.push(String(attempt));
  }

  if (paper && paper !== 'All') {
    query += " AND (paper = ? OR paper = 'All')";
    params.push(String(paper));
  }

  if (materialType && materialType !== 'ALL') {
    query += " AND (material_type = ? OR material_type = 'ALL')";
    params.push(String(materialType));
  }

  query += ' ORDER BY created_at DESC LIMIT 1';
  const material = db.prepare(query).get(...params);

  return res.json({
    available: !!material,
    material: material || null,
    message: material
      ? 'Matching evaluation material loaded'
      : 'Evaluation material is not available for the selected paper and attempt yet. Please try again once the required material has been uploaded.',
  });
});

// Public Contact / Support Form
router.post('/contact', (req: Request, res: Response) => {
  try {
    const { name, email, subject, message, evaluationId, category } = req.body;
    if (!name || !email || !subject || !message) {
      return res.status(400).json({ error: 'Name, email, subject, and message are required.' });
    }

    const ticketId = `tkt_${crypto.randomBytes(8).toString('hex')}`;
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const ticketNumber = `CEC-${randomNum}`;

    db.prepare(`
      INSERT INTO support_tickets (
        id, ticket_number, name, email, subject, message,
        category, role, evaluation_id, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'GUEST', ?, 'OPEN')
    `).run(
      ticketId,
      ticketNumber,
      name.trim(),
      email.trim().toLowerCase(),
      subject.trim(),
      message.trim(),
      category || 'GENERAL_QUERY',
      evaluationId || null
    );

    return res.status(201).json({
      success: true,
      ticketId,
      ticketNumber,
      message: `Your inquiry has been submitted (Ticket #${ticketNumber}). Our CA support team will respond within 24 hours at ${email}.`,
    });
  } catch (error: unknown) {
    console.error('Contact form error:', error);
    return res.status(500).json({ error: 'Failed to submit inquiry' });
  }
});

export default router;
