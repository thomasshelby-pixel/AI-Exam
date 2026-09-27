import crypto from 'node:crypto';
import { db } from '../db.js';
import { AuthRequest } from '../auth.js';
import { Response, NextFunction } from 'express';

export type FeatureStatus = 'ENABLED' | 'TESTING' | 'DISABLED' | 'COMING_SOON';
export type FeatureApplication = 'CHECKER' | 'MCQ_ARENA';

export interface FeatureFlagRecord {
  id: string;
  application: FeatureApplication;
  feature_key: string;
  feature_name: string;
  description: string;
  status: FeatureStatus;
  student_message: string;
  display_in_student_dashboard: number; // 0 or 1
  display_order: number;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

export interface FeatureTesterRecord {
  id: string;
  feature_id?: string;
  application?: FeatureApplication;
  feature_key: string;
  email: string;
  created_at: string;
  created_by: string;
}

export interface FeatureWithTesters extends FeatureFlagRecord {
  testers: FeatureTesterRecord[];
}

export interface FeatureAccessResult {
  application: FeatureApplication;
  featureKey: string;
  featureName: string;
  allowed: boolean;
  status: FeatureStatus;
  studentMessage: string;
  reason:
    | 'admin_override'
    | 'enabled'
    | 'tester_allowed'
    | 'limited_testing'
    | 'disabled'
    | 'coming_soon'
    | 'unauthenticated';
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FEATURE_KEY_REGEX = /^[a-z0-9_-]{2,64}$/;

/**
 * Initializes feature control database tables and safely seeds initial configuration.
 * Hard rule: Never overwrite existing Super Admin settings on restart or deployment.
 * Migration is completely idempotent and preserves all existing production records.
 */
export function initFeatureFlagsTable(): void {
  // 1. Create base tables if they don't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS feature_flags (
      id TEXT PRIMARY KEY,
      application TEXT NOT NULL DEFAULT 'MCQ_ARENA',
      feature_key TEXT NOT NULL,
      feature_name TEXT NOT NULL,
      description TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'COMING_SOON',
      student_message TEXT,
      display_in_student_dashboard INTEGER NOT NULL DEFAULT 1,
      display_order INTEGER NOT NULL DEFAULT 0,
      created_by TEXT DEFAULT 'SYSTEM_INIT',
      updated_by TEXT DEFAULT 'SYSTEM_INIT',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS feature_testers (
      id TEXT PRIMARY KEY,
      feature_id TEXT,
      application TEXT DEFAULT 'MCQ_ARENA',
      feature_key TEXT NOT NULL,
      email TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      created_by TEXT,
      UNIQUE(feature_key, email)
    );

    CREATE INDEX IF NOT EXISTS idx_feature_testers_lookup ON feature_testers(feature_key, email);
  `);

  // 2. Perform safe, non-destructive schema migrations for existing database instances
  try {
    const flagCols = (db.prepare('PRAGMA table_info(feature_flags)').all() as unknown) as Array<{ name: string }>;
    const flagColNames = new Set(flagCols.map((c) => c.name));

    if (!flagColNames.has('application')) {
      db.exec("ALTER TABLE feature_flags ADD COLUMN application TEXT NOT NULL DEFAULT 'MCQ_ARENA';");
    }
    if (!flagColNames.has('description')) {
      db.exec("ALTER TABLE feature_flags ADD COLUMN description TEXT DEFAULT '';");
    }
    if (!flagColNames.has('display_in_student_dashboard')) {
      db.exec("ALTER TABLE feature_flags ADD COLUMN display_in_student_dashboard INTEGER NOT NULL DEFAULT 1;");
    }
    if (!flagColNames.has('display_order')) {
      db.exec("ALTER TABLE feature_flags ADD COLUMN display_order INTEGER NOT NULL DEFAULT 0;");
    }
    if (!flagColNames.has('created_by')) {
      db.exec("ALTER TABLE feature_flags ADD COLUMN created_by TEXT DEFAULT 'SYSTEM_INIT';");
    }

    const testerCols = (db.prepare('PRAGMA table_info(feature_testers)').all() as unknown) as Array<{ name: string }>;
    const testerColNames = new Set(testerCols.map((c) => c.name));

    if (!testerColNames.has('feature_id')) {
      db.exec('ALTER TABLE feature_testers ADD COLUMN feature_id TEXT;');
    }
    if (!testerColNames.has('application')) {
      db.exec("ALTER TABLE feature_testers ADD COLUMN application TEXT DEFAULT 'MCQ_ARENA';");
    }

    // Create unique composite index on (application, feature_key)
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_feature_flags_app_key ON feature_flags(application, feature_key);
      CREATE INDEX IF NOT EXISTS idx_feature_testers_app_key ON feature_testers(application, feature_key);
    `);
  } catch (migErr) {
    console.warn('[Feature Control Migration] Non-fatal migration note:', migErr);
  }

  // 3. Initial Configuration: MCQ Arena features
  // Hard Rule: Only insert if feature does not exist. Never overwrite on restart!
  const defaultMcqFeatures = [
    {
      key: 'mcq_arena',
      name: 'MCQ Arena',
      description: 'Core CA MCQ Practice Arena, syllabus filters, and question sessions.',
      status: 'TESTING' as FeatureStatus,
      msg: "MCQ Arena is currently under development and limited testing. We're working on improving the question bank, practice experience and overall system. Public access will be available soon.",
      order: 1,
    },
    {
      key: 'mcq_practice',
      name: 'Normal Practice',
      description: 'Standard single-concept ICAI MCQs with instantaneous step references.',
      status: 'ENABLED' as FeatureStatus,
      msg: 'Normal Practice is currently undergoing scheduled maintenance. Please check back soon.',
      order: 2,
    },
    {
      key: 'mcq_case_studies',
      name: 'Case-Based Practice',
      description: 'Integrated case-study scenario questions with sequential multi-part questions.',
      status: 'ENABLED' as FeatureStatus,
      msg: 'Case-Based MCQs are currently under development. Please check back soon.',
      order: 3,
    },
    {
      key: 'mcq_mock_tests',
      name: 'Practice Tests',
      description: 'Timed full-syllabus ICAI mock exam simulations with negative marking.',
      status: 'ENABLED' as FeatureStatus,
      msg: 'Timed practice tests are temporarily unavailable while we prepare the test series.',
      order: 4,
    },
    {
      key: 'mcq_leaderboard',
      name: 'Leaderboard',
      description: 'State-wide and pan-India student performance rankings.',
      status: 'COMING_SOON' as FeatureStatus,
      msg: 'The MCQ Arena Leaderboard is coming soon in an upcoming update.',
      order: 5,
    },
  ];

  for (const feat of defaultMcqFeatures) {
    const exists = db.prepare('SELECT id FROM feature_flags WHERE application = ? AND feature_key = ?').get('MCQ_ARENA', feat.key);
    if (!exists) {
      db.prepare(`
        INSERT INTO feature_flags (id, application, feature_key, feature_name, description, status, student_message, display_in_student_dashboard, display_order, created_by, updated_by)
        VALUES (?, 'MCQ_ARENA', ?, ?, ?, ?, ?, 1, ?, 'SYSTEM_INIT', 'SYSTEM_INIT')
      `).run(
        `feat_mcq_${feat.key}`,
        feat.key,
        feat.name,
        feat.description,
        feat.status,
        feat.msg,
        feat.order
      );
    }
  }

  // Initial testers for mcq_arena: preserve and seed if missing
  const initialTesters = ['adityakumart484@gmail.com', 'test1@gmail.com'];
  const arenaFlag = db.prepare("SELECT id FROM feature_flags WHERE application = 'MCQ_ARENA' AND feature_key = 'mcq_arena'").get() as { id: string } | undefined;
  for (const email of initialTesters) {
    const norm = email.toLowerCase().trim();
    const testerExists = db.prepare('SELECT id FROM feature_testers WHERE feature_key = ? AND lower(email) = ?').get('mcq_arena', norm);
    if (!testerExists) {
      db.prepare(`
        INSERT OR IGNORE INTO feature_testers (id, feature_id, application, feature_key, email, created_by)
        VALUES (?, ?, 'MCQ_ARENA', 'mcq_arena', ?, 'SYSTEM_INIT')
      `).run(`tester_${crypto.randomUUID()}`, arenaFlag?.id || 'feat_mcq_arena', norm);
    }
  }

  // 4. Initial Configuration: CA Exam Checker AI features
  // Real existing student-facing features
  const defaultCheckerFeatures = [
    {
      key: 'checker_answer_evaluation',
      name: 'Answer Sheet Evaluation',
      description: 'Upload and automated evaluation of student handwritten answer copies.',
      status: 'ENABLED' as FeatureStatus,
      msg: 'Answer Sheet Evaluation is temporarily unavailable due to scheduled maintenance. Please check back soon.',
      order: 1,
    },
    {
      key: 'checker_evaluation_report',
      name: 'Evaluation Report',
      description: 'Detailed mark breakdown, step-by-step scoring, and examiner feedback.',
      status: 'ENABLED' as FeatureStatus,
      msg: 'Evaluation Reports are temporarily undergoing maintenance. Please check back soon.',
      order: 2,
    },
    {
      key: 'checker_checked_copy',
      name: 'Checked Copy',
      description: 'Annotated PDF checked copy with question-wise marks and examiner observations.',
      status: 'ENABLED' as FeatureStatus,
      msg: 'Checked Copy downloads are temporarily unavailable while we perform system maintenance.',
      order: 3,
    },
    {
      key: 'checker_performance_analysis',
      name: 'Performance Analysis',
      description: 'Comprehensive syllabus coverage matrix and chapter-wise performance analysis.',
      status: 'COMING_SOON' as FeatureStatus,
      msg: "Performance Analysis is coming soon. We're working on chapter-wise performance analytics and statutory syllabus coverage matrices.",
      order: 4,
    },
  ];

  for (const feat of defaultCheckerFeatures) {
    const exists = db.prepare('SELECT id FROM feature_flags WHERE application = ? AND feature_key = ?').get('CHECKER', feat.key);
    if (!exists) {
      db.prepare(`
        INSERT INTO feature_flags (id, application, feature_key, feature_name, description, status, student_message, display_in_student_dashboard, display_order, created_by, updated_by)
        VALUES (?, 'CHECKER', ?, ?, ?, ?, ?, 1, ?, 'SYSTEM_INIT', 'SYSTEM_INIT')
      `).run(
        `feat_checker_${feat.key}`,
        feat.key,
        feat.name,
        feat.description,
        feat.status,
        feat.msg,
        feat.order
      );
    }
  }

  // Backfill any missing feature_id on feature_testers
  try {
    db.exec(`
      UPDATE feature_testers
      SET feature_id = (
        SELECT id FROM feature_flags WHERE feature_flags.feature_key = feature_testers.feature_key LIMIT 1
      )
      WHERE feature_id IS NULL OR feature_id = '';
    `);
  } catch {}
}

/**
 * Returns all controllable features with their allowed tester accounts.
 * Optionally filtered by application ('CHECKER' or 'MCQ_ARENA').
 */
export function getAllFeatures(application?: FeatureApplication): FeatureWithTesters[] {
  let flagsQuery = 'SELECT * FROM feature_flags';
  const queryParams: any[] = [];
  if (application) {
    flagsQuery += ' WHERE application = ?';
    queryParams.push(application.toUpperCase());
  }
  flagsQuery += ' ORDER BY application ASC, display_order ASC, created_at ASC';

  const flags = (db.prepare(flagsQuery).all(...queryParams) as unknown) as FeatureFlagRecord[];

  return flags.map((flag) => {
    const testers = (db.prepare(
      'SELECT id, feature_id, application, feature_key, email, created_at, created_by FROM feature_testers WHERE (feature_id = ? OR feature_key = ?) ORDER BY email ASC'
    ).all(flag.id, flag.feature_key) as unknown) as FeatureTesterRecord[];

    return {
      ...flag,
      status: flag.status as FeatureStatus,
      application: (flag.application || 'MCQ_ARENA') as FeatureApplication,
      display_in_student_dashboard: flag.display_in_student_dashboard !== undefined ? Number(flag.display_in_student_dashboard) : 1,
      display_order: flag.display_order || 0,
      testers,
    };
  });
}

/**
 * Returns a specific feature flag by key (and optional application scope) with its testers.
 */
export function getFeatureByKey(featureKey: string, application?: FeatureApplication): FeatureWithTesters | null {
  let flag: FeatureFlagRecord | undefined;

  if (application) {
    flag = (db.prepare('SELECT * FROM feature_flags WHERE application = ? AND feature_key = ?').get(application.toUpperCase(), featureKey) as unknown) as FeatureFlagRecord | undefined;
  } else {
    // If application is not specified, lookup by feature_key
    flag = (db.prepare('SELECT * FROM feature_flags WHERE feature_key = ? LIMIT 1').get(featureKey) as unknown) as FeatureFlagRecord | undefined;
  }

  if (!flag) return null;

  const testers = (db.prepare(
    'SELECT id, feature_id, application, feature_key, email, created_at, created_by FROM feature_testers WHERE (feature_id = ? OR feature_key = ?) ORDER BY email ASC'
  ).all(flag.id, flag.feature_key) as unknown) as FeatureTesterRecord[];

  return {
    ...flag,
    status: flag.status as FeatureStatus,
    application: (flag.application || 'MCQ_ARENA') as FeatureApplication,
    display_in_student_dashboard: flag.display_in_student_dashboard !== undefined ? Number(flag.display_in_student_dashboard) : 1,
    display_order: flag.display_order || 0,
    testers,
  };
}

/**
 * Super Admin adds a brand new feature definition.
 * Strictly deterministic and system-controlled.
 */
export function createFeature(
  params: {
    application: FeatureApplication;
    featureKey: string;
    featureName: string;
    description?: string;
    status?: FeatureStatus;
    studentMessage?: string;
    displayInStudentDashboard?: boolean;
    displayOrder?: number;
  },
  adminUser: { id: string; email: string },
  clientIp?: string
): FeatureWithTesters {
  const cleanApp: FeatureApplication = (params.application || 'MCQ_ARENA').toUpperCase() as FeatureApplication;
  if (cleanApp !== 'CHECKER' && cleanApp !== 'MCQ_ARENA') {
    throw new Error("Application must be either 'CHECKER' or 'MCQ_ARENA'.");
  }

  const cleanKey = (params.featureKey || '').toLowerCase().trim();
  if (!cleanKey || !FEATURE_KEY_REGEX.test(cleanKey)) {
    throw new Error(
      `Invalid feature key '${params.featureKey}'. Must be 2-64 lowercase alphanumeric characters with hyphens or underscores (no spaces).`
    );
  }

  const cleanName = (params.featureName || '').trim();
  if (!cleanName) {
    throw new Error('Feature name is required.');
  }

  // Enforce unique application + feature_key
  const existing = db.prepare('SELECT id FROM feature_flags WHERE application = ? AND feature_key = ?').get(cleanApp, cleanKey);
  if (existing) {
    throw new Error(`Feature with key '${cleanKey}' already exists for application '${cleanApp}'.`);
  }

  const initialStatus: FeatureStatus = params.status
    ? (params.status.toUpperCase() as FeatureStatus)
    : 'COMING_SOON';
  if (!['ENABLED', 'TESTING', 'DISABLED', 'COMING_SOON'].includes(initialStatus)) {
    throw new Error(`Invalid status '${params.status}'. Must be ENABLED, TESTING, DISABLED, or COMING_SOON.`);
  }

  const id = `feat_${cleanApp.toLowerCase()}_${cleanKey}`;
  const description = (params.description || '').trim();
  const studentMessage = (params.studentMessage || '').trim();
  const displayInDashboard = params.displayInStudentDashboard !== false ? 1 : 0;
  const displayOrder = typeof params.displayOrder === 'number' ? params.displayOrder : 0;

  db.prepare(`
    INSERT INTO feature_flags (
      id, application, feature_key, feature_name, description,
      status, student_message, display_in_student_dashboard, display_order,
      created_by, updated_by, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(
    id,
    cleanApp,
    cleanKey,
    cleanName,
    description,
    initialStatus,
    studentMessage,
    displayInDashboard,
    displayOrder,
    adminUser.email,
    adminUser.email
  );

  // Record in audit_logs
  try {
    const auditId = `audit_feat_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const details = JSON.stringify({
      action: 'FEATURE_CREATED',
      application: cleanApp,
      featureKey: cleanKey,
      featureName: cleanName,
      status: initialStatus,
      createdBy: adminUser.email,
      timestamp: new Date().toISOString(),
    });
    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details, ip_address, created_at)
      VALUES (?, ?, 'FEATURE_CREATED', 'FEATURE_FLAG', ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(auditId, adminUser.id, cleanKey, details, clientIp || '127.0.0.1');
  } catch (auditErr) {
    console.warn('[Feature Control] Audit logging warning:', auditErr);
  }

  const created = getFeatureByKey(cleanKey, cleanApp);
  if (!created) throw new Error('Failed to retrieve newly created feature.');
  return created;
}

/**
 * Evaluates whether an authenticated user (or visitor) can access a given feature.
 * Supports both checkFeatureAccess(user, 'mcq_arena') and checkFeatureAccess(user, 'CHECKER', 'checker_answer_evaluation').
 * Super Admin & MCQ Admin retain full administrative access.
 * Normal students:
 * - ENABLED: allowed
 * - TESTING: allowed ONLY if student's email is in tester allowlist
 * - DISABLED: blocked (Maintenance message)
 * - COMING_SOON: blocked (Coming Soon message)
 */
export function checkFeatureAccess(
  user: { id?: string; email?: string; role?: string } | undefined,
  featureKeyOrApp: string,
  maybeFeatureKey?: string
): FeatureAccessResult {
  const application: FeatureApplication | undefined = maybeFeatureKey
    ? (featureKeyOrApp.toUpperCase() as FeatureApplication)
    : undefined;
  const featureKey = maybeFeatureKey || featureKeyOrApp;

  const feature = getFeatureByKey(featureKey, application);

  // If feature is not registered in feature flags table, allow access by default
  if (!feature) {
    return {
      application: application || 'MCQ_ARENA',
      featureKey,
      featureName: featureKey,
      allowed: true,
      status: 'ENABLED',
      studentMessage: '',
      reason: 'enabled',
    };
  }

  const role = (user?.role || '').toUpperCase();
  const isPrivilegedAdmin = role === 'SUPER_ADMIN' || role === 'ADMIN' || (role === 'MCQ_ADMIN' && feature.application === 'MCQ_ARENA');

  // Super Admin & MCQ Admin always bypass restrictions
  if (isPrivilegedAdmin) {
    return {
      application: feature.application,
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
      application: feature.application,
      featureKey: feature.feature_key,
      featureName: feature.feature_name,
      allowed: true,
      status: 'ENABLED',
      studentMessage: feature.student_message || '',
      reason: 'enabled',
    };
  }

  // 2. COMING_SOON: Feature is not accessible yet
  if (feature.status === 'COMING_SOON') {
    const defaultMsg = `${feature.feature_name} is coming soon. We're working on this feature and it will be available soon.`;
    return {
      application: feature.application,
      featureKey: feature.feature_key,
      featureName: feature.feature_name,
      allowed: false,
      status: 'COMING_SOON',
      studentMessage: feature.student_message || defaultMsg,
      reason: 'coming_soon',
    };
  }

  // 3. DISABLED: No normal student can access (Maintenance / Temporarily Unavailable)
  if (feature.status === 'DISABLED') {
    const defaultMsg = `${feature.feature_name} is temporarily unavailable while we work on improvements. Please check back soon.`;
    return {
      application: feature.application,
      featureKey: feature.feature_key,
      featureName: feature.feature_name,
      allowed: false,
      status: 'DISABLED',
      studentMessage: feature.student_message || defaultMsg,
      reason: 'disabled',
    };
  }

  // 4. TESTING: Only allowlisted testers for THIS specific feature can access
  if (feature.status === 'TESTING') {
    if (!user || !user.email) {
      const defaultMsg = `${feature.feature_name} is currently under development and limited testing. Public access will be available soon.`;
      return {
        application: feature.application,
        featureKey: feature.feature_key,
        featureName: feature.feature_name,
        allowed: false,
        status: 'TESTING',
        studentMessage: feature.student_message || defaultMsg,
        reason: 'unauthenticated',
      };
    }

    const normEmail = user.email.toLowerCase().trim();
    // Scope tester check strictly to this feature (by feature_id or feature_key)
    const testerMatch = db.prepare(`
      SELECT id FROM feature_testers
      WHERE (feature_id = ? OR feature_key = ?)
        AND lower(email) = ?
    `).get(feature.id, feature.feature_key, normEmail);

    if (testerMatch) {
      return {
        application: feature.application,
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
      application: feature.application,
      featureKey: feature.feature_key,
      featureName: feature.feature_name,
      allowed: false,
      status: 'TESTING',
      studentMessage: feature.student_message || defaultMsg,
      reason: 'limited_testing',
    };
  }

  return {
    application: feature.application,
    featureKey: feature.feature_key,
    featureName: feature.feature_name,
    allowed: false,
    status: 'DISABLED',
    studentMessage: feature.student_message || 'Feature unavailable.',
    reason: 'disabled',
  };
}

/**
 * Super Admin updates feature status, student message, visibility, or metadata.
 * Logs event into audit_logs.
 */
export function updateFeatureControl(
  featureKey: string,
  params: {
    status?: FeatureStatus;
    studentMessage?: string;
    featureName?: string;
    description?: string;
    displayInStudentDashboard?: boolean;
    displayOrder?: number;
    application?: FeatureApplication;
  },
  adminUser: { id: string; email: string },
  clientIp?: string
): FeatureWithTesters {
  const current = getFeatureByKey(featureKey, params.application);
  if (!current) {
    throw new Error(`Feature with key '${featureKey}' not found.`);
  }

  const newStatus = params.status ? (params.status.toUpperCase() as FeatureStatus) : current.status;
  if (!['ENABLED', 'TESTING', 'DISABLED', 'COMING_SOON'].includes(newStatus)) {
    throw new Error(`Invalid feature status '${params.status}'. Must be ENABLED, TESTING, DISABLED, or COMING_SOON.`);
  }

  const newMessage = params.studentMessage !== undefined ? params.studentMessage.trim() : current.student_message;
  const newName = params.featureName !== undefined ? params.featureName.trim() : current.feature_name;
  const newDesc = params.description !== undefined ? params.description.trim() : current.description;
  const newDisplay = params.displayInStudentDashboard !== undefined ? (params.displayInStudentDashboard ? 1 : 0) : current.display_in_student_dashboard;
  const newOrder = params.displayOrder !== undefined ? params.displayOrder : current.display_order;

  db.prepare(`
    UPDATE feature_flags
    SET status = ?, student_message = ?, feature_name = ?, description = ?,
        display_in_student_dashboard = ?, display_order = ?,
        updated_by = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(newStatus, newMessage, newName, newDesc, newDisplay, newOrder, adminUser.email, current.id);

  // Log in existing audit_logs table
  try {
    const auditId = `audit_feat_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const details = JSON.stringify({
      application: current.application,
      featureKey,
      featureName: newName,
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

  const updated = getFeatureByKey(featureKey, current.application);
  if (!updated) throw new Error('Failed to retrieve updated feature.');
  return updated;
}

/**
 * Super Admin adds a tester email to a feature's testing allowlist.
 * Validates format, normalizes to lowercase, prevents duplicates, strictly scopes to feature.
 */
export function addTesterToFeature(
  featureKey: string,
  email: string,
  adminUser: { id: string; email: string },
  clientIp?: string,
  application?: FeatureApplication
): FeatureTesterRecord {
  const feature = getFeatureByKey(featureKey, application);
  if (!feature) {
    throw new Error(`Feature with key '${featureKey}' not found.`);
  }

  const normEmail = (email || '').toLowerCase().trim();
  if (!normEmail || !EMAIL_REGEX.test(normEmail)) {
    throw new Error(`Invalid email address format: '${email}'`);
  }

  // Check duplicate strictly for this feature
  const existing = (db.prepare(`
    SELECT id, email FROM feature_testers
    WHERE (feature_id = ? OR feature_key = ?) AND lower(email) = ?
  `).get(feature.id, feature.feature_key, normEmail) as unknown) as FeatureTesterRecord | undefined;

  if (existing) {
    throw new Error(`Tester email '${normEmail}' is already allowlisted for this feature.`);
  }

  const testerId = `tester_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  db.prepare(`
    INSERT INTO feature_testers (id, feature_id, application, feature_key, email, created_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(testerId, feature.id, feature.application, feature.feature_key, normEmail, adminUser.email);

  try {
    const auditId = `audit_feat_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const details = JSON.stringify({
      application: feature.application,
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
    feature_id: feature.id,
    application: feature.application,
    feature_key: feature.feature_key,
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
  clientIp?: string,
  application?: FeatureApplication
): { success: boolean; removedEmail: string } {
  const feature = getFeatureByKey(featureKey, application);
  const normInput = (testerIdOrEmail || '').toLowerCase().trim();

  let tester: FeatureTesterRecord | undefined;

  if (feature) {
    tester = (db.prepare(`
      SELECT id, email, application, feature_key FROM feature_testers
      WHERE (feature_id = ? OR feature_key = ?) AND (id = ? OR lower(email) = ?)
    `).get(feature.id, feature.feature_key, testerIdOrEmail, normInput) as unknown) as FeatureTesterRecord | undefined;
  } else {
    tester = (db.prepare(`
      SELECT id, email, application, feature_key FROM feature_testers
      WHERE id = ? OR lower(email) = ?
    `).get(testerIdOrEmail, normInput) as unknown) as FeatureTesterRecord | undefined;
  }

  if (!tester) {
    throw new Error(`Tester '${testerIdOrEmail}' not found for feature '${featureKey}'.`);
  }

  db.prepare('DELETE FROM feature_testers WHERE id = ?').run(tester.id);

  try {
    const auditId = `audit_feat_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const details = JSON.stringify({
      application: tester.application,
      featureKey: tester.feature_key,
      action: 'REMOVE_TESTER',
      testerEmail: tester.email,
      removedBy: adminUser.email,
      timestamp: new Date().toISOString(),
    });
    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details, ip_address, created_at)
      VALUES (?, ?, 'FEATURE_TESTER_REMOVE', 'FEATURE_FLAG', ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(auditId, adminUser.id, tester.feature_key, details, clientIp || '127.0.0.1');
  } catch (auditErr) {
    console.warn('[Feature Control] Audit logging warning:', auditErr);
  }

  return { success: true, removedEmail: tester.email };
}

/**
 * Express middleware to strictly enforce feature status on backend API routes.
 * Blocks unauthorized students with 403 Forbidden.
 * Supports requireFeatureAccess('mcq_arena') and requireFeatureAccess('CHECKER', 'checker_answer_evaluation').
 */
export function requireFeatureAccess(featureKeyOrApp: string, maybeFeatureKey?: string) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    // If not authenticated, let authentication middleware handle 401
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const access = checkFeatureAccess(req.user, featureKeyOrApp, maybeFeatureKey);
    if (!access.allowed) {
      return res.status(403).json({
        error: 'Feature unavailable',
        application: access.application,
        featureKey: access.featureKey,
        status: access.status,
        studentMessage: access.studentMessage,
        reason: access.reason,
      });
    }

    next();
  };
}
