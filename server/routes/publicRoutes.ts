import { Router, Request, Response } from 'express';
import { Buffer } from 'node:buffer';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { db } from '../db.js';
import { getValidAttemptsForLevel } from '../services/attemptService.js';
import { findAuthoritativeMaterialWithFallback, normalizeMtpSeries, getSubjectKeyCandidates } from '../services/materialLookupService.js';
import { authenticateToken, AuthRequest, JWT_SECRET } from '../auth.js';
import { contactTicketRateLimiter, websiteVisitorRateLimiter } from '../utils/rateLimiter.js';
import { syncRecordToFirestore } from '../services/firestoreSyncService.js';
import { getAllFirestoreDocs, getFirestoreDoc } from '../services/firestoreDbService.js';
import {
  getPublishedAppRelease,
  getDownloadableAppRelease,
  downloadAppUpdateRelease,
  shouldServeOtaUpdate,
  ANDROID_PACKAGE_ID,
} from '../services/appUpdateService.js';

const router = Router();

type PublishedAndroidAsset = {
  sourceName: string;
  sizeBytes: number;
  updatedAt: string | null;
  expiresAt: number;
};

let androidAssetCache: PublishedAndroidAsset | null = null;

/**
 * Resolve the currently published APK without exposing the repository/release URL
 * to the browser. The public download endpoint below streams this asset through
 * the CA Exam Checker AI website and sets a human-friendly filename.
 */
async function getPublishedAndroidAsset(): Promise<PublishedAndroidAsset> {
  if (androidAssetCache && androidAssetCache.expiresAt > Date.now()) return androidAssetCache;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(
      'https://api.github.com/repos/thomasshelby-pixel/AI-Exam-App/releases/tags/android-latest',
      {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'CA-Exam-Checker-AI-Android-Download',
        },
        signal: controller.signal,
      },
    );
    if (!response.ok) throw new Error('Latest Android build metadata is temporarily unavailable.');
    const release = await response.json() as {
      assets?: Array<{ name?: string; size?: number; updated_at?: string }>;
    };
    // GitHub's release asset API normalizes uploaded spaces to dots on some uploads.
    // The browser-facing Content-Disposition below always uses "Exam Checker AI.apk".
    const allowedNames = ['Exam Checker AI.apk', 'Exam.Checker.AI.apk', 'Exam-Checker-AI.apk'];
    const asset = (release.assets || []).find((entry) => allowedNames.includes(String(entry.name || '')));
    if (!asset?.name || !Number.isFinite(asset.size) || Number(asset.size) <= 0) {
      throw new Error('The official Android package is not currently available.');
    }

    androidAssetCache = {
      sourceName: asset.name,
      sizeBytes: Number(asset.size),
      updatedAt: typeof asset.updated_at === 'string' ? asset.updated_at : null,
      expiresAt: Date.now() + 5 * 60 * 1000,
    };
    return androidAssetCache;
  } finally {
    clearTimeout(timeout);
  }
}

function formatApkSize(sizeBytes: number): string {
  const mb = sizeBytes / (1024 * 1024);
  return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
}

function recordCompletedAndroidDownload(transferredBytes: number): void {
  const eventId = `apkdl_${crypto.randomUUID()}`;
  const downloadedAt = new Date().toISOString();
  try {
    db.prepare(`
      INSERT OR IGNORE INTO android_apk_download_events (id, downloaded_at, file_size_bytes)
      VALUES (?, ?, ?)
    `).run(eventId, downloadedAt, transferredBytes);
    const event = db.prepare(`
      SELECT id, downloaded_at, file_size_bytes
      FROM android_apk_download_events
      WHERE id = ?
      LIMIT 1
    `).get(eventId) as Record<string, unknown> | undefined;
    if (event) {
      void syncRecordToFirestore('android_apk_download_events', eventId, event).catch((syncError: unknown) => {
        console.warn('[AndroidDownload] Could not sync download analytics event:', syncError);
      });
    }
  } catch (trackingError) {
    console.warn('[AndroidDownload] Could not record completed download:', trackingError);
  }
}

// Public app metadata used by the dedicated download page.
router.get('/android-app', async (_req: Request, res: Response) => {
  try {
    const release = await getPublishedAppRelease('APK');
    if (release) {
      res.setHeader('Cache-Control', 'no-store');
      return res.json({
        available: true,
        websiteName: 'CA Exam Checker AI',
        appName: 'Exam Checker AI',
        packageId: ANDROID_PACKAGE_ID,
        version: release.versionName,
        versionName: release.versionName,
        versionCode: release.versionCode,
        mandatory: release.mandatory,
        releaseNotes: release.releaseNotes,
        fileName: 'Exam Checker AI.apk',
        sizeBytes: release.sizeBytes,
        sizeLabel: formatApkSize(release.sizeBytes),
        updatedAt: release.publishedAt || release.uploadedAt,
        downloadPath: `/api/public/download/android?versionCode=${release.versionCode}`,
      });
    }
  } catch (error) {
    console.warn('[AndroidDownload] Admin-published APK metadata is temporarily unavailable; checking the legacy release:', error);
  }

  try {
    const asset = await getPublishedAndroidAsset();
    res.setHeader('Cache-Control', 'public, max-age=120');
    return res.json({
      available: true,
      websiteName: 'CA Exam Checker AI',
      appName: 'Exam Checker AI',
      packageId: ANDROID_PACKAGE_ID,
      version: '0.1.0',
      versionName: '0.1.0',
      fileName: 'Exam Checker AI.apk',
      sizeBytes: asset.sizeBytes,
      sizeLabel: formatApkSize(asset.sizeBytes),
      updatedAt: asset.updatedAt,
      downloadPath: '/api/public/download/android',
    });
  } catch (error) {
    console.warn('[AndroidDownload] Could not resolve the latest APK metadata:', error);
    return res.status(503).json({
      available: false,
      error: 'The Android app download is temporarily unavailable. Please try again shortly.',
    });
  }
});

// Native Android app checks this endpoint at launch to decide whether to show an APK update prompt.
router.get('/android-app/update', async (_req: Request, res: Response) => {
  try {
    const release = await getPublishedAppRelease('APK');
    res.setHeader('Cache-Control', 'no-store');
    if (!release) {
      return res.json({ available: false, packageId: ANDROID_PACKAGE_ID });
    }
    return res.json({
      available: true,
      packageId: ANDROID_PACKAGE_ID,
      versionName: release.versionName,
      versionCode: release.versionCode,
      mandatory: release.mandatory,
      releaseNotes: release.releaseNotes,
      sizeBytes: release.sizeBytes,
      sizeLabel: formatApkSize(release.sizeBytes),
      checksum: release.checksum,
      publishedAt: release.publishedAt || release.uploadedAt,
      downloadPath: `/api/public/download/android?versionCode=${release.versionCode}`,
    });
  } catch (error) {
    console.warn('[AndroidDownload] Update manifest lookup failed:', error);
    return res.status(503).json({ available: false, error: 'Update check is temporarily unavailable.' });
  }
});

// Self-hosted Capgo OTA update manifest. It receives CapacitorUpdater's device/app
// info payload and returns a bundle only for this Android package when a newer
// semver release is published.
router.post('/app-updates/ota', async (req: Request, res: Response) => {
  // Update manifests must never be cached: each request is scoped to the
  // currently installed bundle version reported by the native updater.
  res.setHeader('Cache-Control', 'no-store');
  try {
    const release = await getPublishedAppRelease('OTA');
    if (!shouldServeOtaUpdate((req.body || {}) as Record<string, unknown>, release)) {
      // Capgo's self-hosted protocol uses this explicit code to classify a
      // normal no-update check as "up to date" rather than an unknown response.
      return res.status(200).json({
        error: 'no_new_version_available',
        message: 'No new version available',
      });
    }
    return res.status(200).json({
      version: release!.versionName,
      url: `https://caexamcheckerai.com/api/public/app-updates/ota/bundle/${encodeURIComponent(release!.versionName)}`,
      checksum: release!.checksum,
    });
  } catch (error) {
    console.warn('[AppUpdates] OTA manifest request failed:', error);
    // Do not disguise a Firestore/storage failure as a successful no-update
    // response; the updater can retry this transient server-side failure.
    return res.status(503).json({
      error: 'ota_update_check_unavailable',
      message: 'The OTA update check is temporarily unavailable.',
    });
  }
});

router.get('/app-updates/ota/bundle/:version', async (req: Request, res: Response) => {
  try {
    const release = await getDownloadableAppRelease('OTA', String(req.params.version || ''));
    if (!release) return res.status(404).json({ error: 'OTA bundle not found or not published.' });
    const bundle = await downloadAppUpdateRelease(release);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Length', String(bundle.length));
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.send(bundle);
  } catch (error) {
    console.error('[AppUpdates] OTA bundle download failed:', error);
    return res.status(502).json({ error: 'The live-update bundle could not be verified or downloaded.' });
  }
});

// Serve the published APK from our own domain so visitors never land on GitHub.
router.get('/download/android', async (req: Request, res: Response) => {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const requestedVersionCode = String(req.query.versionCode || '').trim();
    let adminRelease = null;
    if (requestedVersionCode) {
      adminRelease = await getDownloadableAppRelease('APK', requestedVersionCode);
      if (!adminRelease) return res.status(404).json({ error: 'That APK release is not available.' });
    } else {
      adminRelease = await getPublishedAppRelease('APK');
    }

    if (adminRelease) {
      const buffer = await downloadAppUpdateRelease(adminRelease);
      if (buffer.length !== adminRelease.sizeBytes || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
        return res.status(502).json({ error: 'The published Android package failed integrity verification.' });
      }
      res.status(200);
      res.setHeader('Content-Type', 'application/vnd.android.package-archive');
      res.setHeader('Content-Disposition', "attachment; filename=\"Exam Checker AI.apk\"; filename*=UTF-8''Exam%20Checker%20AI.apk");
      res.setHeader('Content-Length', String(buffer.length));
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.once('finish', () => {
        if (res.statusCode === 200) recordCompletedAndroidDownload(buffer.length);
      });
      return res.end(buffer);
    }

    const asset = await getPublishedAndroidAsset();
    const encodedName = encodeURIComponent(asset.sourceName);
    const sourceUrl = `https://github.com/thomasshelby-pixel/AI-Exam-App/releases/download/android-latest/${encodedName}`;
    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), 45000);
    const upstream = await fetch(sourceUrl, {
      redirect: 'follow',
      headers: { 'User-Agent': 'CA-Exam-Checker-AI-Android-Download' },
      signal: controller.signal,
    });
    if (!upstream.ok) {
      console.warn('[AndroidDownload] The published APK could not be retrieved.');
      return res.status(502).json({ error: 'The Android app download failed to start. Please try again.' });
    }

    const reader = upstream.body?.getReader();
    if (!reader) {
      return res.status(502).json({ error: 'The Android app download failed to start. Please try again.' });
    }

    // Validate the APK signature from the first few bytes, then stream the rest
    // to the browser instead of waiting for the entire package to buffer in memory.
    const initialChunks: Buffer[] = [];
    let initialLength = 0;
    while (initialLength < 4) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      initialChunks.push(chunk);
      initialLength += chunk.length;
    }

    const header = Buffer.concat(initialChunks, initialLength);
    if (header.length < 4 || header[0] !== 0x50 || header[1] !== 0x4b) {
      await reader.cancel().catch(() => undefined);
      console.warn('[AndroidDownload] The published package did not have an APK/ZIP signature.');
      return res.status(502).json({ error: 'The Android package could not be verified. Please try again later.' });
    }

    res.status(200);
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Disposition', "attachment; filename=\"Exam Checker AI.apk\"; filename*=UTF-8''Exam%20Checker%20AI.apk");
    res.setHeader('Content-Length', String(asset.sizeBytes));
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");

    let transferredBytes = 0;
    const writeChunk = async (chunk: Buffer) => {
      transferredBytes += chunk.length;
      if (!res.write(chunk)) {
        await new Promise<void>((resolve) => res.once('drain', resolve));
      }
    };

    // Count completed downloads only after the whole asset was transferred.
    res.once('finish', () => {
      if (transferredBytes !== asset.sizeBytes) {
        console.warn('[AndroidDownload] Incomplete APK response was not counted as a completed download.');
        return;
      }
      recordCompletedAndroidDownload(transferredBytes);
    });

    for (const chunk of initialChunks) await writeChunk(chunk);
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      await writeChunk(Buffer.from(value));
    }
    if (transferredBytes !== asset.sizeBytes) {
      console.warn('[AndroidDownload] APK stream size did not match the published asset metadata.');
      res.destroy(new Error('The APK download was incomplete.'));
      return;
    }
    return res.end();
  } catch (error) {
    console.error('[AndroidDownload] Download request failed:', error);
    if (!res.headersSent) return res.status(502).json({ error: 'The Android app download is temporarily unavailable. Please try again shortly.' });
    // Once headers/body have started, destroy the response instead of ending a
    // truncated APK as if it were a successful download.
    res.destroy(error instanceof Error ? error : undefined);
    return;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
});

// Lightweight anonymous website visitor counter. It stores only a random first-party
// visitor key, the URL path (without query strings), and the UTC date; no email or IP
// address is stored by this analytics endpoint.
router.post('/analytics/visit', websiteVisitorRateLimiter, async (req: Request, res: Response) => {
  const visitorId = typeof req.body?.visitorId === 'string' ? req.body.visitorId.trim() : '';
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(visitorId)) {
    return res.status(400).json({ error: 'A valid anonymous visitor identifier is required.' });
  }

  const rawPath = typeof req.body?.pagePath === 'string' ? req.body.pagePath : '/';
  let pagePath = '/';
  try {
    pagePath = new URL(rawPath, 'https://local.invalid').pathname.slice(0, 180) || '/';
  } catch {
    pagePath = '/';
  }
  if (!pagePath.startsWith('/')) pagePath = '/';

  const visitDate = new Date().toISOString().slice(0, 10);
  const id = `${visitorId}_${visitDate}`;
  const createdAt = new Date().toISOString();

  try {
    const inserted = db.prepare(`
      INSERT OR IGNORE INTO website_visitor_daily (id, visitor_id, visit_date, first_page_path, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, visitorId, visitDate, pagePath, createdAt);

    if (Number(inserted.changes) > 0) {
      const event = db.prepare(`
        SELECT id, visitor_id, visit_date, first_page_path, created_at
        FROM website_visitor_daily
        WHERE id = ?
        LIMIT 1
      `).get(id) as Record<string, unknown> | undefined;

      if (event) {
        // Mirror one stable record per anonymous visitor/day, not every page refresh.
        await syncRecordToFirestore('website_visitor_daily', id, event);
      }
    }

    return res.status(202).json({ tracked: true });
  } catch (error) {
    console.warn('[WebsiteAnalytics] Visitor event could not be recorded:', error);
    // Analytics should never block a user from viewing the website.
    return res.status(202).json({ tracked: false });
  }
});

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
    supportEmail: settingsMap.SUPPORT_EMAIL || 'support@caexamcheckerai.com',
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
    const { level, subjectKey, attempt, paper, materialType, mtpSeries, mtp_series, modelTestNumber, model_test_number, sourceFormat, source_format } = req.query;
    if (!level || !subjectKey) {
      return res.status(400).json({ error: 'Level and subjectKey are required.' });
    }

    const isPyq = materialType === 'PYQ';
    const rawSeries = mtpSeries || mtp_series;
    const reqSourceFormat = sourceFormat || source_format;
    const rawModelTestNumber = modelTestNumber || model_test_number;

    const material = await findAuthoritativeMaterialWithFallback({
      level: String(level),
      subjectKey: String(subjectKey),
      attempt: attempt ? String(attempt) : undefined,
      paper: paper ? String(paper) : undefined,
      materialType: materialType ? String(materialType) : undefined,
      mtpSeries: rawSeries,
      modelTestNumber: rawModelTestNumber ? Number(rawModelTestNumber) : undefined,
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
            model_test_number: material.model_test_number ?? material.modelTestNumber ?? null,
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
router.post('/contact', contactTicketRateLimiter, (req: Request, res: Response) => {
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
export const getPublicReviewsHandler = async (req: Request, res: Response) => {
  try {
    // 1. Authoritative multi-instance reconciliation with Cloud Firestore
    try {
      const fsReviews = await getAllFirestoreDocs<any>('reviews');
      for (const rev of fsReviews) {
        if (!rev.id || !rev.user_id) continue;
        let tags = rev.experience_tags;
        if (Array.isArray(tags)) tags = JSON.stringify(tags);
        else if (typeof tags !== 'string') tags = null;

        db.prepare(`
          INSERT INTO reviews (
            id, user_id, student_name, student_email, display_name, ca_level,
            rating, review_text, experience_tags, status, likes_count, dislikes_count,
            admin_reply, admin_reply_at, admin_reply_by, admin_reply_name,
            moderation_reason, moderated_at, moderated_by, is_verified_evaluation,
            moderation_note, approved_at, approved_by, rejected_at, rejected_by,
            created_at, updated_at
          ) VALUES (
            ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, CURRENT_TIMESTAMP
          )
          ON CONFLICT(id) DO UPDATE SET
            display_name = excluded.display_name,
            ca_level = excluded.ca_level,
            rating = excluded.rating,
            review_text = excluded.review_text,
            experience_tags = excluded.experience_tags,
            status = excluded.status,
            likes_count = excluded.likes_count,
            dislikes_count = excluded.dislikes_count,
            admin_reply = excluded.admin_reply,
            admin_reply_at = excluded.admin_reply_at,
            admin_reply_by = excluded.admin_reply_by,
            admin_reply_name = excluded.admin_reply_name,
            is_verified_evaluation = excluded.is_verified_evaluation,
            updated_at = CURRENT_TIMESTAMP
        `).run(
          rev.id, rev.user_id, rev.student_name || '', rev.student_email || '',
          rev.display_name || '', rev.ca_level || 'INTERMEDIATE', rev.rating || 5,
          rev.review_text || '', tags, rev.status || 'PUBLISHED',
          rev.likes_count ?? rev.likesCount ?? 0,
          rev.dislikes_count ?? rev.dislikesCount ?? 0,
          rev.admin_reply ?? rev.adminReply ?? null,
          rev.admin_reply_at ?? rev.adminReplyAt ?? null,
          rev.admin_reply_by ?? rev.adminReplyBy ?? null,
          rev.admin_reply_name ?? rev.adminReplyName ?? null,
          rev.moderation_reason ?? rev.moderationReason ?? null,
          rev.moderated_at ?? rev.moderatedAt ?? null,
          rev.moderated_by ?? rev.moderatedBy ?? null,
          rev.is_verified_evaluation ?? 1,
          rev.moderation_note || null,
          rev.approved_at || null,
          rev.approved_by || null,
          rev.rejected_at || null,
          rev.rejected_by || null,
          rev.created_at || rev.createdAt || new Date().toISOString()
        );
      }
    } catch (fsErr) {
      console.warn('[PublicReviews] Firestore reconciliation notice:', fsErr);
    }

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
    return res.json({
      reviews: [],
      stats: {
        totalReviews: 0,
        averageRating: 0,
        ratingBreakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      },
    });
  }
};

router.get('/reviews', getPublicReviewsHandler);

// Upvote / Downvote Review Interaction
export const votePublicReviewHandler = async (req: AuthRequest, res: Response) => {
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

    // Sync updated vote counts to Firestore
    const fullReview = db.prepare('SELECT * FROM reviews WHERE id = ?').get(reviewId) as any;
    if (fullReview) {
      let tags = fullReview.experience_tags;
      try { if (typeof tags === 'string') tags = JSON.parse(tags); } catch {}
      try {
        await syncRecordToFirestore('reviews', reviewId, {
          ...fullReview,
          experience_tags: tags || [],
          likes_count: updatedCounts.likes_count,
          dislikes_count: updatedCounts.dislikes_count,
          updated_at: new Date().toISOString(),
        });
      } catch (syncErr) {
        console.warn('[ReviewVoteSync] Warning syncing vote to Firestore:', syncErr);
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
