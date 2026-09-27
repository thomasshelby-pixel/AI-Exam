import crypto from 'node:crypto';
import { db } from '../db.js';
import { AuthRequest } from '../auth.js';
import { Response, NextFunction } from 'express';

export type FeatureStatus = 'ENABLED' | 'TESTING' | 'DISABLED';

export interface FeatureFlagRecord {
  id: string;
  feature_key: string;
  feature_name: string;
  status: FeatureStatus;
  student_message: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

export interface FeatureTesterRecord {
  id: string;
  feature_key: string;
  email: string;
  created_at: string;
  created_by: string;
}

export interface FeatureWithTesters extends FeatureFlagRecord {
  testers: FeatureTesterRecord[];
}

export interface FeatureAccessResult {
  featureKey: string;
  featureName: string;
  allowed: boolean;
  status: FeatureStatus;
  studentMessage: string;
  reason: 'admin_override' | 'enabled' | 'tester_allowed' | 'limited_testing' | 'disabled' | 'unauthenticated';
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Initializes feature control database tables and safely seeds initial configuration.
 * Hard rule: Never overwrite existing Super Admin settings on restart or deployment.
 */
export function initFeatureFlagsTable(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS feature_flags (
      id TEXT PRIMARY KEY,
      feature_key TEXT UNIQUE NOT NULL,
      feature_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'TESTING',
      student_message TEXT,
      updated_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS feature_testers (
      id TEXT PRIMARY KEY,
      feature_key TEXT NOT NULL,
      email TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      created_by TEXT,
      UNIQUE(feature_key, email)
    );

    CREATE INDEX IF NOT EXISTS idx_feature_testers_lookup ON feature_testers(feature_key, email);
  `);

  // Initial configuration: mcq_arena in TESTING mode with 2 allowed testers
  const existingMcqArena = db.prepare('SELECT id FROM feature_flags WHERE feature_key = ?').get('mcq_arena') as { id: string } | undefined;
  if (!existingMcqArena) {
    db.prepare(`
      INSERT INTO feature_flags (id, feature_key, feature_name, status, student_message, updated_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      'feat_mcq_arena',
      'mcq_arena',
      'MCQ Arena',
      'TESTING',
      "MCQ Arena is currently under development and limited testing. We're working on improving the question bank, practice experience and overall system. Public access will be available soon.",
      'SYSTEM_INIT'
    );

    const initialTesters = ['adityakumart484@gmail.com', 'test1@gmail.com'];
    for (const email of initialTesters) {
      db.prepare(`
        INSERT OR IGNORE INTO feature_testers (id, feature_key, email, created_by)
        VALUES (?, 'mcq_arena', ?, 'SYSTEM_INIT')
      `).run(`tester_${crypto.randomUUID()}`, email.toLowerCase().trim());
    }
  }

  // Extensible structure: register other current/future student features if not present
  const defaultFeatures = [
    {
      key: 'mcq_practice',
      name: 'MCQ Practice',
      status: 'ENABLED' as FeatureStatus,
      msg: 'MCQ Practice is currently undergoing scheduled maintenance. Please check back soon.',
    },
    {
      key: 'mcq_case_studies',
      name: 'Case-Based MCQs',
      status: 'ENABLED' as FeatureStatus,
      msg: 'Case-Based MCQs are currently under development. Please check back soon.',
    },
    {
      key: 'mcq_mock_tests',
      name: 'Practice Tests',
      status: 'ENABLED' as FeatureStatus,
      msg: 'Timed practice tests are temporarily unavailable while we prepare the test series.',
    },
    {
      key: 'mcq_leaderboard',
      name: 'Leaderboard',
      status: 'DISABLED' as FeatureStatus,
      msg: 'The MCQ Arena Leaderboard is coming soon in an upcoming update.',
    },
  ];

  for (const feat of defaultFeatures) {
    const exists = db.prepare('SELECT id FROM feature_flags WHERE feature_key = ?').get(feat.key);
    if (!exists) {
      db.prepare(`
        INSERT INTO feature_flags (id, feature_key, feature_name, status, student_message, updated_by)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        `feat_${feat.key}`,
        feat.key,
        feat.name,
        feat.status,
        feat.msg,
        'SYSTEM_INIT'
      );
    }
  }
}

/**
 * Returns all controllable features with their allowed tester accounts.
 */
export function getAllFeatures(): FeatureWithTesters[] {
  const flags = (db.prepare('SELECT * FROM feature_flags ORDER BY created_at ASC').all() as unknown) as FeatureFlagRecord[];
  return flags.map((flag) => {
    const testers = (db.prepare(
      'SELECT id, feature_key, email, created_at, created_by FROM feature_testers WHERE feature_key = ? ORDER BY email ASC'
    ).all(flag.feature_key) as unknown) as FeatureTesterRecord[];
    return {
      ...flag,
      status: flag.status as FeatureStatus,
      testers,
    };
  });
}

/**
 * Returns a specific feature flag by key with its testers.
 */
export function getFeatureByKey(featureKey: string): FeatureWithTesters | null {
  const flag = (db.prepare('SELECT * FROM feature_flags WHERE feature_key = ?').get(featureKey) as unknown) as FeatureFlagRecord | undefined;
  if (!flag) return null;

  const testers = (db.prepare(
    'SELECT id, feature_key, email, created_at, created_by FROM feature_testers WHERE feature_key = ? ORDER BY email ASC'
  ).all(featureKey) as unknown) as FeatureTesterRecord[];

  return {
    ...flag,
    status: flag.status as FeatureStatus,
    testers,
  };
}

/**
 * Evaluates whether an authenticated user (or visitor) can access a given feature.
 * Super Admin retains full administrative access.
 * Normal students:
 * - ENABLED: allowed
 * - TESTING: allowed ONLY if student's email is in tester allowlist
 * - DISABLED: blocked
 */
export function checkFeatureAccess(
  user: { id?: string; email?: string; role?: string } | undefined,
  featureKey: string
): FeatureAccessResult {
  const feature = getFeatureByKey(featureKey);

  // If feature is not registered in feature flags table, allow access by default
  if (!feature) {
    return {
      featureKey,
      featureName: featureKey,
      allowed: true,
      status: 'ENABLED',
      studentMessage: '',
      reason: 'enabled',
    };
  }

  const role = (user?.role || '').toUpperCase();
  const isPrivilegedAdmin = role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'MCQ_ADMIN';

  // Super Admin & MCQ Admin always bypass restrictions
  if (isPrivilegedAdmin) {
    return {
      featureKey: feature.feature_key,
      featureName: feature.feature_name,
      allowed: true,
      status: feature.status,
      studentMessage: feature.student_message || '',
      reason: 'admin_override',
    };
  }

  // 1. ENABLED: All students have access
  if (feature.status === 'ENABLED') {
    return {
      featureKey: feature.feature_key,
      featureName: feature.feature_name,
      allowed: true,
      status: 'ENABLED',
      studentMessage: feature.student_message || '',
      reason: 'enabled',
    };
  }

  // 2. DISABLED: No normal student can access
  if (feature.status === 'DISABLED') {
    const defaultMsg = `${feature.feature_name} is temporarily unavailable while we work on improvements. Please check back soon.`;
    return {
      featureKey: feature.feature_key,
      featureName: feature.feature_name,
      allowed: false,
      status: 'DISABLED',
      studentMessage: feature.student_message || defaultMsg,
      reason: 'disabled',
    };
  }

  // 3. TESTING: Only allowlisted testers can access
  if (feature.status === 'TESTING') {
    if (!user || !user.email) {
      const defaultMsg = `${feature.feature_name} is currently under development and limited testing. Public access will be available soon.`;
      return {
        featureKey: feature.feature_key,
        featureName: feature.feature_name,
        allowed: false,
        status: 'TESTING',
        studentMessage: feature.student_message || defaultMsg,
        reason: 'unauthenticated',
      };
    }

    const normEmail = user.email.toLowerCase().trim();
    const testerMatch = db.prepare(
      'SELECT id FROM feature_testers WHERE feature_key = ? AND lower(email) = ?'
    ).get(featureKey, normEmail);

    if (testerMatch) {
      return {
        featureKey: feature.feature_key,
        featureName: feature.feature_name,
        allowed: true,
        status: 'TESTING',
        studentMessage: feature.student_message || '',
        reason: 'tester_allowed',
      };
    }

    const defaultMsg = `${feature.feature_name} is currently under development and limited testing. We're working on improving the question bank, practice experience and overall system. Public access will be available soon.`;
    return {
      featureKey: feature.feature_key,
      featureName: feature.feature_name,
      allowed: false,
      status: 'TESTING',
      studentMessage: feature.student_message || defaultMsg,
      reason: 'limited_testing',
    };
  }

  return {
    featureKey: feature.feature_key,
    featureName: feature.feature_name,
    allowed: false,
    status: 'DISABLED',
    studentMessage: feature.student_message || 'Feature unavailable.',
    reason: 'disabled',
  };
}

/**
 * Super Admin updates feature status and/or custom student message.
 * Logs event into audit_logs.
 */
export function updateFeatureControl(
  featureKey: string,
  params: {
    status?: FeatureStatus;
    studentMessage?: string;
  },
  adminUser: { id: string; email: string },
  clientIp?: string
): FeatureWithTesters {
  const current = getFeatureByKey(featureKey);
  if (!current) {
    throw new Error(`Feature with key '${featureKey}' not found.`);
  }

  const newStatus = params.status ? (params.status.toUpperCase() as FeatureStatus) : current.status;
  if (!['ENABLED', 'TESTING', 'DISABLED'].includes(newStatus)) {
    throw new Error(`Invalid feature status '${params.status}'. Must be ENABLED, TESTING, or DISABLED.`);
  }

  const newMessage = params.studentMessage !== undefined ? params.studentMessage.trim() : current.student_message;

  db.prepare(`
    UPDATE feature_flags
    SET status = ?, student_message = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
    WHERE feature_key = ?
  `).run(newStatus, newMessage, adminUser.email, featureKey);

  // Log in existing audit_logs table
  try {
    const auditId = `audit_feat_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const details = JSON.stringify({
      featureKey,
      featureName: current.feature_name,
      oldStatus: current.status,
      newStatus,
      oldMessage: current.student_message,
      newMessage,
      changedBy: adminUser.email,
      timestamp: new Date().toISOString(),
    });

    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details, ip_address, created_at)
      VALUES (?, ?, 'FEATURE_CONTROL_UPDATE', 'FEATURE_FLAG', ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(auditId, adminUser.id, featureKey, details, clientIp || '127.0.0.1');
  } catch (auditErr) {
    console.warn('[Feature Control] Audit logging warning:', auditErr);
  }

  const updated = getFeatureByKey(featureKey);
  if (!updated) throw new Error('Failed to retrieve updated feature.');
  return updated;
}

/**
 * Super Admin adds a tester email to a feature's testing allowlist.
 * Validates format, normalizes to lowercase, prevents duplicates, logs audit.
 */
export function addTesterToFeature(
  featureKey: string,
  email: string,
  adminUser: { id: string; email: string },
  clientIp?: string
): FeatureTesterRecord {
  const feature = getFeatureByKey(featureKey);
  if (!feature) {
    throw new Error(`Feature with key '${featureKey}' not found.`);
  }

  const normEmail = (email || '').toLowerCase().trim();
  if (!normEmail || !EMAIL_REGEX.test(normEmail)) {
    throw new Error(`Invalid email address format: '${email}'`);
  }

  const existing = (db.prepare(
    'SELECT id, email FROM feature_testers WHERE feature_key = ? AND lower(email) = ?'
  ).get(featureKey, normEmail) as unknown) as FeatureTesterRecord | undefined;

  if (existing) {
    throw new Error(`Tester email '${normEmail}' is already allowlisted for this feature.`);
  }

  const testerId = `tester_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  db.prepare(`
    INSERT INTO feature_testers (id, feature_key, email, created_by)
    VALUES (?, ?, ?, ?)
  `).run(testerId, featureKey, normEmail, adminUser.email);

  try {
    const auditId = `audit_feat_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const details = JSON.stringify({
      featureKey,
      action: 'ADD_TESTER',
      testerEmail: normEmail,
      addedBy: adminUser.email,
      timestamp: new Date().toISOString(),
    });
    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details, ip_address, created_at)
      VALUES (?, ?, 'FEATURE_TESTER_ADD', 'FEATURE_FLAG', ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(auditId, adminUser.id, featureKey, details, clientIp || '127.0.0.1');
  } catch (auditErr) {
    console.warn('[Feature Control] Audit logging warning:', auditErr);
  }

  return {
    id: testerId,
    feature_key: featureKey,
    email: normEmail,
    created_at: new Date().toISOString(),
    created_by: adminUser.email,
  };
}

/**
 * Super Admin removes a tester from a feature's testing allowlist.
 */
export function removeTesterFromFeature(
  featureKey: string,
  testerIdOrEmail: string,
  adminUser: { id: string; email: string },
  clientIp?: string
): { success: boolean; removedEmail: string } {
  const normInput = (testerIdOrEmail || '').toLowerCase().trim();
  const tester = (db.prepare(`
    SELECT id, email FROM feature_testers
    WHERE feature_key = ? AND (id = ? OR lower(email) = ?)
  `).get(featureKey, testerIdOrEmail, normInput) as unknown) as FeatureTesterRecord | undefined;

  if (!tester) {
    throw new Error(`Tester '${testerIdOrEmail}' not found for feature '${featureKey}'.`);
  }

  db.prepare('DELETE FROM feature_testers WHERE id = ?').run(tester.id);

  try {
    const auditId = `audit_feat_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const details = JSON.stringify({
      featureKey,
      action: 'REMOVE_TESTER',
      testerEmail: tester.email,
      removedBy: adminUser.email,
      timestamp: new Date().toISOString(),
    });
    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details, ip_address, created_at)
      VALUES (?, ?, 'FEATURE_TESTER_REMOVE', 'FEATURE_FLAG', ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(auditId, adminUser.id, featureKey, details, clientIp || '127.0.0.1');
  } catch (auditErr) {
    console.warn('[Feature Control] Audit logging warning:', auditErr);
  }

  return { success: true, removedEmail: tester.email };
}

/**
 * Express middleware to strictly enforce feature status on backend API routes.
 * Blocks unauthorized students with 403 Forbidden.
 */
export function requireFeatureAccess(featureKey: string) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    // If not authenticated, let authentication middleware handle 401
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const access = checkFeatureAccess(req.user, featureKey);
    if (!access.allowed) {
      return res.status(403).json({
        error: 'Feature unavailable',
        featureKey: access.featureKey,
        status: access.status,
        studentMessage: access.studentMessage,
        reason: access.reason,
      });
    }

    next();
  };
}
