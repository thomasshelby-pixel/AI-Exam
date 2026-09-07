import { Router, Request, Response } from 'express';
import crypto from 'node:crypto';
import { db } from '../db.js';

const router = Router();

// Pricing Information
router.get('/pricing', (req: Request, res: Response) => {
  const priceSettings = db.prepare('SELECT key, value FROM pricing_settings').all() as { key: string; value: string }[];
  const settingsMap = Object.fromEntries(priceSettings.map((s) => [s.key, s.value]));

  const pricePerCreditINR = Number(settingsMap.PRICE_PER_CREDIT_INR) || 10;
  const freeTierEvaluations = Number(settingsMap.FREE_TIER_EVALUATIONS) || 2;

  const plans = [
    {
      id: 'free_starter',
      name: 'Free Trial',
      priceINR: 0,
      credits: freeTierEvaluations,
      description: 'Ideal for trying your first two ICAI mock test papers',
      features: [
        '2 Full-Length Answer Sheet Evaluations',
        'Official ICAI Step-Marking Breakdown',
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
    {
      id: 'institute_plan',
      name: 'CA Coaching Institute Tier',
      priceINR: null, // Custom
      customQuote: true,
      description: 'Custom bulk evaluation and batch management for top CA coaching academies',
      features: [
        'Up to 500+ student sponsored accounts',
        'Batch & class assignment management',
        'Teacher dashboard with batch analytics',
        'Custom institute question papers & answer keys',
        'Dedicated account manager & support',
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
  });
});

// Check whether reference material exists for a given subject
router.get('/materials-check', (req: Request, res: Response) => {
  const { level, subjectKey } = req.query;
  if (!level || !subjectKey) {
    return res.status(400).json({ error: 'Level and subjectKey are required.' });
  }

  const material = db.prepare(`
    SELECT id, question_paper_title, attempt, material_type
    FROM evaluation_materials
    WHERE level = ? AND subject_key = ?
    ORDER BY created_at DESC LIMIT 1
  `).get(String(level), String(subjectKey));

  return res.json({
    available: !!material,
    material: material || null,
  });
});

// Public Contact / Support Form
router.post('/contact', (req: Request, res: Response) => {
  try {
    const { name, email, subject, message, evaluationId } = req.body;
    if (!name || !email || !subject || !message) {
      return res.status(400).json({ error: 'Name, email, subject, and message are required.' });
    }

    const ticketId = `tkt_${crypto.randomBytes(8).toString('hex')}`;
    db.prepare(`
      INSERT INTO support_tickets (id, name, email, subject, message, evaluation_id, status)
      VALUES (?, ?, ?, ?, ?, ?, 'OPEN')
    `).run(
      ticketId,
      name.trim(),
      email.trim().toLowerCase(),
      subject.trim(),
      message.trim(),
      evaluationId || null
    );

    return res.status(201).json({
      success: true,
      ticketId,
      message: 'Your inquiry has been submitted. Our CA support team will respond within 24 hours at ' + email,
    });
  } catch (error: unknown) {
    console.error('Contact form error:', error);
    return res.status(500).json({ error: 'Failed to submit inquiry' });
  }
});

export default router;
