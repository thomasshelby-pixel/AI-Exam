import { Router, Response } from 'express';
import { optionalAuthenticateToken, AuthRequest } from '../auth.js';
import { checkFeatureAccess, getAllFeatures, FeatureApplication } from '../services/featureControlService.js';

const router = Router();

/**
 * GET /api/features
 * Returns student-facing feature statuses and messages (does NOT expose tester lists or admin fields).
 * Can be filtered by ?application=CHECKER or ?application=MCQ_ARENA
 */
router.get('/', optionalAuthenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const appQuery = req.query.application as string | undefined;
    const application = appQuery ? (appQuery.toUpperCase() as FeatureApplication) : undefined;
    const all = getAllFeatures(application);

    // Sanitize for student visibility: strip tester allowlist
    const publicFeatures = all.map((f) => ({
      id: f.id,
      application: f.application,
      feature_key: f.feature_key,
      feature_name: f.feature_name,
      description: f.description,
      status: f.status,
      student_message: f.student_message,
      display_in_student_dashboard: f.display_in_student_dashboard,
      display_order: f.display_order,
    }));

    res.json({ success: true, features: publicFeatures });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to list features' });
  }
});

/**
 * GET /api/features/:application/:featureKey/access
 * Scoped feature access check by application & feature key.
 */
router.get('/:application/:featureKey/access', optionalAuthenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const { application, featureKey } = req.params;
    const access = checkFeatureAccess(req.user, application, featureKey);
    res.json(access);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to check feature access' });
  }
});

/**
 * GET /api/features/:featureKey/access
 * Authenticated student or client checks whether they have access to a specific feature.
 * Super Admin bypasses restrictions.
 * Normal students:
 * - ENABLED: allowed = true
 * - TESTING: allowed = true ONLY if student's email is in tester allowlist
 * - DISABLED: allowed = false
 * - COMING_SOON: allowed = false
 */
router.get('/:featureKey/access', optionalAuthenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const { featureKey } = req.params;
    const access = checkFeatureAccess(req.user, featureKey);
    res.json(access);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to check feature access' });
  }
});

export default router;
