import { Router, Response } from 'express';
import { optionalAuthenticateToken, AuthRequest } from '../auth.js';
import { checkFeatureAccess } from '../services/featureControlService.js';

const router = Router();

/**
 * GET /api/features/:featureKey/access
 * Authenticated student or client checks whether they have access to a specific feature.
 * Super Admin bypasses restrictions.
 * Normal students:
 * - ENABLED: allowed = true
 * - TESTING: allowed = true ONLY if student's email is in tester allowlist
 * - DISABLED: allowed = false
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
