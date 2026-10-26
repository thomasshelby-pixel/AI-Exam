import { Router, Response } from 'express';
import { db } from '../db.js';
import { authenticateToken, requireRole, AuthRequest } from '../auth.js';
import { getAllFirestoreDocs } from '../services/firestoreDbService.js';

const router = Router();

router.use(authenticateToken);
router.use(requireRole('SUPER_ADMIN'));

type AndroidApkMetricsCache = {
  count: number | null;
  url: string;
  refreshedAt: string | null;
  expiresAt: number;
};

let androidApkMetricsCache: AndroidApkMetricsCache | null = null;

async function getAndroidApkMetrics(): Promise<{ count: number | null; url: string; refreshedAt: string | null }> {
  const fallbackUrl = 'https://github.com/thomasshelby-pixel/AI-Exam-App/releases/download/android-latest/Exam-Checker-AI.apk';
  if (androidApkMetricsCache && androidApkMetricsCache.expiresAt > Date.now()) {
    return {
      count: androidApkMetricsCache.count,
      url: androidApkMetricsCache.url,
      refreshedAt: androidApkMetricsCache.refreshedAt,
    };
  }

  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), 4000);
    const response = await fetch(
      'https://api.github.com/repos/thomasshelby-pixel/AI-Exam-App/releases/tags/android-latest',
      {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'Exam-Checker-AI-Admin-Analytics',
        },
        signal: controller.signal,
      },
    );
    if (!response.ok) throw new Error(`GitHub release lookup returned HTTP ${response.status}`);
    const release = await response.json() as {
      assets?: Array<{ name?: string; download_count?: number; browser_download_url?: string }>;
    };
    const asset = (release.assets || []).find((item) => item.name === 'Exam-Checker-AI.apk');
    const count = typeof asset?.download_count === 'number' ? asset.download_count : null;
    const url = asset?.browser_download_url || fallbackUrl;
    const refreshedAt = new Date().toISOString();
    androidApkMetricsCache = { count, url, refreshedAt, expiresAt: Date.now() + 5 * 60 * 1000 };
    return { count, url, refreshedAt };
  } catch (error) {
    console.warn('[AdminAnalytics] Could not fetch Android APK release downloads:', error);
    const fallback = { count: null, url: fallbackUrl, refreshedAt: null };
    androidApkMetricsCache = { ...fallback, expiresAt: Date.now() + 60 * 1000 };
    return fallback;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

// Real usage data only: downloads from the published APK release, recent authenticated
// sessions, and anonymized first-party visitor IDs. Visitor counts start when tracking
// is deployed; no historical or synthetic visitor totals are generated.
router.get('/', async (_req: AuthRequest, res: Response) => {
  try {
    const activeUsers = db.prepare(`
      SELECT COUNT(DISTINCT s.user_id) AS count
      FROM user_sessions s
      INNER JOIN users u ON u.id = s.user_id
      WHERE s.status = 'ACTIVE'
        AND u.status = 'ACTIVE'
        AND datetime(s.expires_at) > datetime('now')
        AND datetime(s.last_activity_at) >= datetime('now', '-30 minutes')
    `).get() as { count: number };

    const localRows = db.prepare(`
      SELECT id, visitor_id, visit_date, first_page_path, created_at
      FROM website_visitor_daily
    `).all() as Array<Record<string, unknown>>;
    const durableRows = await getAllFirestoreDocs<Record<string, unknown>>('website_visitor_daily').catch(() => []);
    const visitorDays = new Map<string, { visitorId: string; visitDate: string }>();
    const addVisit = (row: Record<string, unknown>) => {
      const visitorId = String(row.visitor_id || row.visitorId || '').trim();
      const visitDate = String(row.visit_date || row.visitDate || '').slice(0, 10);
      if (!visitorId || !/^\d{4}-\d{2}-\d{2}$/.test(visitDate)) return;
      visitorDays.set(`${visitorId}_${visitDate}`, { visitorId, visitDate });
    };
    localRows.forEach(addVisit);
    durableRows.forEach(addVisit);

    const cutoffDate = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const allVisitors = new Set<string>();
    const recentVisitors = new Set<string>();
    const recentVisitorDays: typeof visitorDays = new Map();
    let trackingStartedAt: string | null = null;
    for (const [key, visit] of visitorDays.entries()) {
      allVisitors.add(visit.visitorId);
      if (!trackingStartedAt || visit.visitDate < trackingStartedAt) trackingStartedAt = visit.visitDate;
      if (visit.visitDate >= cutoffDate) {
        recentVisitors.add(visit.visitorId);
        recentVisitorDays.set(key, visit);
      }
    }

    const apk = await getAndroidApkMetrics();
    return res.json({
      apkDownloads: apk.count,
      apkDownloadUrl: apk.url,
      apkCountRefreshedAt: apk.refreshedAt,
      activeUsersLast30Minutes: activeUsers.count || 0,
      uniqueVisitorsLast30Days: recentVisitors.size,
      uniqueVisitorsAllTime: allVisitors.size,
      visitorDaysLast30Days: recentVisitorDays.size,
      trackingStartedAt,
      refreshedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[AdminAnalytics] Usage metrics error:', error);
    return res.status(500).json({ error: 'Could not load website and Android app usage metrics.' });
  }
});

export default router;
