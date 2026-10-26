import { Router, Response } from 'express';
import { db } from '../db.js';
import { authenticateToken, requireRole, AuthRequest } from '../auth.js';
import { getAllFirestoreDocs } from '../services/firestoreDbService.js';

const router = Router();

router.use(authenticateToken);
router.use(requireRole('SUPER_ADMIN'));

// Real usage data only: completed website-served APK responses, recent authenticated
// activity, and anonymized first-party visitor IDs. Counts start when each tracker deploys;
// no historical or synthetic visitor totals are generated.
router.get('/', async (_req: AuthRequest, res: Response) => {
  try {
    const localHeartbeats = db.prepare(`
      SELECT user_id, last_activity_at FROM active_user_heartbeats
    `).all() as Array<{ user_id: string; last_activity_at: string }>;
    const durableHeartbeats = await getAllFirestoreDocs<Record<string, unknown>>('active_user_heartbeats').catch(() => []);
    const latestActivity = new Map<string, number>();
    const addHeartbeat = (row: Record<string, unknown>) => {
      const userId = String(row.user_id || row.userId || '').trim();
      const rawTimestamp = row.last_activity_at || row.lastActivityAt;
      const timestamp = typeof rawTimestamp === 'string' ? Date.parse(rawTimestamp) : Number.NaN;
      if (!userId || !Number.isFinite(timestamp)) return;
      latestActivity.set(userId, Math.max(latestActivity.get(userId) || 0, timestamp));
    };
    localHeartbeats.forEach(addHeartbeat);
    durableHeartbeats.forEach(addHeartbeat);

    const activeUserIds = new Set(
      (db.prepare("SELECT id FROM users WHERE status = 'ACTIVE'").all() as Array<{ id: string }>).map((row) => row.id),
    );
    const recentActivityCutoff = Date.now() - 30 * 60 * 1000;
    let activeUserCount = 0;
    for (const [userId, lastActivity] of latestActivity) {
      if (activeUserIds.has(userId) && lastActivity >= recentActivityCutoff) activeUserCount += 1;
    }

    const localDownloadRows = db.prepare(`
      SELECT id, downloaded_at, file_size_bytes
      FROM android_apk_download_events
    `).all() as Array<Record<string, unknown>>;
    const durableDownloadRows = await getAllFirestoreDocs<Record<string, unknown>>('android_apk_download_events').catch(() => []);
    const downloadEvents = new Map<string, string>();
    const addDownloadEvent = (row: Record<string, unknown>) => {
      const id = String(row.id || '').trim();
      const downloadedAt = String(row.downloaded_at || row.downloadedAt || '').trim();
      if (!id || !downloadedAt) return;
      downloadEvents.set(id, downloadedAt);
    };
    localDownloadRows.forEach(addDownloadEvent);
    durableDownloadRows.forEach(addDownloadEvent);
    const apkCountRefreshedAt = new Date().toISOString();
    const apkDownloadsTrackingStartedAt = [...downloadEvents.values()]
      .map((value) => value.slice(0, 10))
      .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))
      .sort()[0] || null;

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

    return res.json({
      // Count only download responses completed by the official website endpoint.
      // These are website-served downloads, not confirmed app installations.
      apkDownloads: downloadEvents.size,
      apkDownloadUrl: 'https://caexamcheckerai.com/api/public/download/android',
      apkCountRefreshedAt,
      apkDownloadsTrackingStartedAt,
      activeUsersLast30Minutes: activeUserCount,
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
