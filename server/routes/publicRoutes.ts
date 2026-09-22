import { Router, Request, Response } from 'express';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { db } from '../db.js';
import { getValidAttemptsForLevel } from '../services/attemptService.js';
import { findAuthoritativeMaterialWithFallback, normalizeMtpSeries, getSubjectKeyCandidates } from '../services/materialLookupService.js';
import { authenticateToken, AuthRequest, JWT_SECRET } from '../auth.js';

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
router.get('/materials-check', async (req: Request, res: Response) => {
  try {
    const { level, subjectKey, attempt, paper, materialType, mtpSeries, mtp_series, sourceFormat, source_format } = req.query;
    if (!level || !subjectKey) {
      return res.status(400).json({ error: 'Level and subjectKey are required.' });
    }

    const isPyq = materialType === 'PYQ';
    const rawSeries = mtpSeries || mtp_series;
    const reqSourceFormat = sourceFormat || source_format;

    const material = await findAuthoritativeMaterialWithFallback({
      level: String(level),
      subjectKey: String(subjectKey),
      attempt: attempt ? String(attempt) : undefined,
      paper: paper ? String(paper) : undefined,
      materialType: materialType ? String(materialType) : undefined,
      mtpSeries: rawSeries,
      sourceFormat: isPyq && reqSourceFormat && reqSourceFormat !== 'ALL' ? String(reqSourceFormat).toUpperCase() : undefined,
      minTextLength: 20,
      isAdminApprovedRequired: false,
    });

    // Query other attempts that have active, verified material for this subject and type
    let availableAttempts: string[] = [];
    try {
      const keyCandidates = getSubjectKeyCandidates(String(subjectKey), String(level));
      const keyPlaceholders = keyCandidates.map(() => '?').join(', ');
      const rows = db.prepare(`
        SELECT DISTINCT attempt
        FROM evaluation_materials
        WHERE UPPER(level) = UPPER(?)
          AND subject_key IN (${keyPlaceholders})
          AND (material_type = ? OR material_type = 'ALL')
          AND status = 'ACTIVE'
          AND question_paper_text IS NOT NULL AND length(trim(question_paper_text)) > 20
        ORDER BY attempt ASC
      `).all(String(level), ...keyCandidates, String(materialType || 'PYQ')) as Array<{ attempt: string }>;
      availableAttempts = rows.map((r) => r.attempt).filter(Boolean);
    } catch (attErr) {
      console.warn('[materials-check] Error finding available attempts:', attErr);
    }

    return res.json({
      available: !!material,
      material: material
        ? {
            id: material.id,
            question_paper_title: material.question_paper_title,
            attempt: material.attempt,
            paper: material.paper,
            material_type: material.material_type,
            mtp_series: normalizeMtpSeries(material.mtp_series) ? String(normalizeMtpSeries(material.mtp_series)) : material.mtp_series,
            source_format: material.source_format,
            combined_source_material_id: material.combined_source_material_id,
            question_material_id: material.question_material_id,
            suggested_answer_material_id: material.suggested_answer_material_id,
            marking_scheme_material_id: material.marking_scheme_material_id,
          }
        : null,
      availableAttempts,
      message: material
        ? 'Matching evaluation material loaded'
        : isPyq
          ? 'Official question paper material for this subject and attempt is currently not available in our system.'
          : 'Evaluation material is not available for the selected paper and attempt yet. Please try again once the required material has been uploaded.',
    });
  } catch (err) {
    console.error('Error in /materials-check:', err);
    return res.status(500).json({
      available: false,
      material: null,
      error: 'Failed to verify material availability from the database.',
      message: 'Failed to verify evaluation material availability due to a server error.',
    });
  }
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

// Public Reviews & Statistics (Transparent Community Showcase, Privacy-Safe)
export const getPublicReviewsHandler = (req: Request, res: Response) => {
  try {
    const { caLevel } = req.query;
    const sortBy = (req.query.sortBy || req.query.sort) as string | undefined;
    const limitParam = req.query.limit ? Math.min(Math.max(1, parseInt(String(req.query.limit), 10) || 100), 100) : 100;

    // Optional user identification from auth header to attach personal vote states
    let currentUserId: string | null = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        currentUserId = decoded?.id || null;
      } catch {
        currentUserId = null;
      }
    }

    // Level filter matching both "FOUNDATION" / "CA Foundation", etc.
    let levelCondition = '';
    const queryParams: any[] = [];

    if (caLevel && caLevel !== 'ALL') {
      const clean = String(caLevel).trim().toUpperCase();
      if (clean.includes('FOUNDATION')) {
        levelCondition = "AND (UPPER(ca_level) LIKE '%FOUNDATION%')";
      } else if (clean.includes('INTERMEDIATE')) {
        levelCondition = "AND (UPPER(ca_level) LIKE '%INTERMEDIATE%')";
      } else if (clean.includes('FINAL')) {
        levelCondition = "AND (UPPER(ca_level) LIKE '%FINAL%')";
      }
    }

    // Determine sorting
    let orderByClause = 'ORDER BY created_at DESC';
    if (sortBy === 'most_liked') {
      orderByClause = 'ORDER BY likes_count DESC, created_at DESC';
    }

    // Fetch published reviews
    const rows = db.prepare(`
      SELECT id, user_id, display_name, ca_level, rating, review_text,
             experience_tags, likes_count, dislikes_count,
             admin_reply, admin_reply_at, admin_reply_name,
             is_verified_evaluation, created_at
      FROM reviews
      WHERE status = 'PUBLISHED' ${levelCondition}
      ${orderByClause}
      LIMIT ${limitParam}
    `).all(...queryParams) as Array<{
      id: string;
      user_id: string;
      display_name: string;
      ca_level: string;
      rating: number;
      review_text: string;
      experience_tags: string | null;
      likes_count: number;
      dislikes_count: number;
      admin_reply: string | null;
      admin_reply_at: string | null;
      admin_reply_name: string | null;
      is_verified_evaluation: number;
      created_at: string;
    }>;

    // Load overall published statistics (across all published reviews for transparency)
    const allPublished = db.prepare(`
      SELECT rating FROM reviews WHERE status = 'PUBLISHED'
    `).all() as Array<{ rating: number }>;

    const totalReviews = allPublished.length;
    let sumRating = 0;
    const ratingBreakdown: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };

    for (const r of allPublished) {
      sumRating += r.rating;
      if (ratingBreakdown[r.rating] !== undefined) {
        ratingBreakdown[r.rating]++;
      }
    }

    const averageRating = totalReviews > 0 ? Number((sumRating / totalReviews).toFixed(1)) : 0;

    // If user is authenticated, retrieve user's votes
    const userVotesMap = new Map<string, 'LIKE' | 'DISLIKE'>();
    if (currentUserId && rows.length > 0) {
      const reviewIds = rows.map((r) => r.id);
      const placeholders = reviewIds.map(() => '?').join(',');
      const userVotes = db.prepare(`
        SELECT review_id, vote_type 
        FROM review_votes 
        WHERE user_id = ? AND review_id IN (${placeholders})
      `).all(currentUserId, ...reviewIds) as Array<{ review_id: string; vote_type: 'LIKE' | 'DISLIKE' }>;

      for (const uv of userVotes) {
        userVotesMap.set(uv.review_id, uv.vote_type);
      }
    }

    const reviews = rows.map((r) => {
      let tags: string[] = [];
      if (r.experience_tags) {
        try {
          tags = typeof r.experience_tags === 'string' ? JSON.parse(r.experience_tags) : r.experience_tags;
        } catch {
          tags = [];
        }
      }

      return {
        id: r.id,
        displayName: r.display_name,
        caLevel: r.ca_level,
        rating: r.rating,
        reviewText: r.review_text,
        experienceTags: tags,
        likesCount: r.likes_count || 0,
        dislikesCount: r.dislikes_count || 0,
        userVote: userVotesMap.get(r.id) || null,
        isVerifiedEvaluation: true,
        adminReply: r.admin_reply || null,
        adminReplyAt: r.admin_reply_at || null,
        adminReplyName: r.admin_reply_name || null,
        isOwnReview: currentUserId ? r.user_id === currentUserId : false,
        date: r.created_at,
      };
    });

    return res.json({
      reviews,
      stats: {
        totalReviews,
        averageRating,
        ratingBreakdown,
      },
    });
  } catch (err: unknown) {
    console.error('Fetch public reviews error:', err);
    return res.status(500).json({ error: 'Failed to fetch public reviews' });
  }
};

router.get('/reviews', getPublicReviewsHandler);

// Upvote / Downvote Review Interaction
export const votePublicReviewHandler = (req: AuthRequest, res: Response) => {
  try {
    const reviewId = req.params.id;
    const userId = req.user!.id;
    const { voteType } = req.body;

    if (voteType !== 'LIKE' && voteType !== 'DISLIKE') {
      return res.status(400).json({ error: 'Invalid voteType. Must be LIKE or DISLIKE.' });
    }

    // 1. Verify review existence & active published status
    const review = db.prepare(`
      SELECT id, user_id, likes_count, dislikes_count, status 
      FROM reviews 
      WHERE id = ?
    `).get(reviewId) as { id: string; user_id: string; likes_count: number; dislikes_count: number; status: string } | undefined;

    if (!review || review.status !== 'PUBLISHED') {
      return res.status(404).json({ error: 'Review not found or not currently published.' });
    }

    // 2. Prevent self-voting
    if (review.user_id === userId) {
      return res.status(400).json({ error: 'You cannot vote on your own review.' });
    }

    // 3. Atomic vote state calculation
    const existingVote = db.prepare(`
      SELECT id, vote_type FROM review_votes WHERE review_id = ? AND user_id = ?
    `).get(reviewId, userId) as { id: string; vote_type: 'LIKE' | 'DISLIKE' } | undefined;

    let newUserVote: 'LIKE' | 'DISLIKE' | null = null;
    let likesDelta = 0;
    let dislikesDelta = 0;

    if (existingVote) {
      if (existingVote.vote_type === voteType) {
        // Toggle OFF (remove vote)
        db.prepare('DELETE FROM review_votes WHERE id = ?').run(existingVote.id);
        if (voteType === 'LIKE') likesDelta = -1;
        else dislikesDelta = -1;
        newUserVote = null;
      } else {
        // Switch vote type
        db.prepare('UPDATE review_votes SET vote_type = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(voteType, existingVote.id);
        if (voteType === 'LIKE') {
          likesDelta = 1;
          dislikesDelta = -1;
        } else {
          likesDelta = -1;
          dislikesDelta = 1;
        }
        newUserVote = voteType;
      }
    } else {
      // New vote
      const voteId = `rv_${crypto.randomBytes(8).toString('hex')}`;
      db.prepare(`
        INSERT INTO review_votes (id, review_id, user_id, vote_type, created_at, updated_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(voteId, reviewId, userId, voteType);

      if (voteType === 'LIKE') likesDelta = 1;
      else dislikesDelta = 1;
      newUserVote = voteType;
    }

    // 4. Update cached counts on reviews table safely
    db.prepare(`
      UPDATE reviews 
      SET likes_count = MAX(0, likes_count + ?),
          dislikes_count = MAX(0, dislikes_count + ?),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(likesDelta, dislikesDelta, reviewId);

    const updatedCounts = db.prepare(`
      SELECT likes_count, dislikes_count FROM reviews WHERE id = ?
    `).get(reviewId) as { likes_count: number; dislikes_count: number };

    // 5. Trigger notification on LIKE (with anti-spam throttling)
    if (newUserVote === 'LIKE' && review.user_id !== userId) {
      const recentNotif = db.prepare(`
        SELECT id FROM notifications 
        WHERE user_id = ? AND type = 'REVIEW_LIKE' AND created_at > datetime('now', '-5 minute')
      `).get(review.user_id);

      if (!recentNotif) {
        const notifId = `notif_${crypto.randomBytes(8).toString('hex')}`;
        db.prepare(`
          INSERT INTO notifications (id, user_id, title, message, type, read, created_at)
          VALUES (?, ?, ?, ?, 'REVIEW_LIKE', 0, CURRENT_TIMESTAMP)
        `).run(notifId, review.user_id, 'Review Liked', 'A fellow CA student liked your review on CA Exam Checker AI.');
      }
    }

    return res.json({
      success: true,
      userVote: newUserVote,
      likesCount: updatedCounts.likes_count,
      dislikesCount: updatedCounts.dislikes_count,
    });
  } catch (err: unknown) {
    console.error('Review vote error:', err);
    return res.status(500).json({ error: 'Failed to record vote' });
  }
};

router.post('/reviews/:id/vote', authenticateToken, votePublicReviewHandler);

export default router;
