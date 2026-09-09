import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { scryptSync, randomBytes } from 'node:crypto';

const DATA_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const DB_FILE = path.join(DATA_DIR, 'ca_exam_checker.db');
export const db = new DatabaseSync(DB_FILE);

// Turn on WAL mode for fast concurrency
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [salt, hash] = stored.split(':');
    if (!salt || !hash) return false;
    const computed = scryptSync(password, salt, 64).toString('hex');
    return computed === hash;
  } catch {
    return false;
  }
}

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      phone TEXT,
      role TEXT NOT NULL DEFAULT 'STUDENT',
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS student_profiles (
      user_id TEXT PRIMARY KEY,
      icai_registration_number TEXT NOT NULL,
      ca_level TEXT NOT NULL DEFAULT 'INTERMEDIATE',
      free_evaluations_used INTEGER NOT NULL DEFAULT 0,
      purchased_credits INTEGER NOT NULL DEFAULT 0,
      institute_id TEXT,
      batch_id TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS institutes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      logo_url TEXT,
      email TEXT UNIQUE NOT NULL,
      phone TEXT NOT NULL,
      address TEXT,
      website TEXT,
      contact_person TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      subscription_plan TEXT NOT NULL DEFAULT 'INSTITUTIONAL_PRO',
      subscription_expires_at TEXT,
      max_students INTEGER NOT NULL DEFAULT 500,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS batches (
      id TEXT PRIMARY KEY,
      institute_id TEXT NOT NULL,
      name TEXT NOT NULL,
      course_level TEXT NOT NULL,
      description TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (institute_id) REFERENCES institutes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS institute_memberships (
      id TEXT PRIMARY KEY,
      institute_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      batch_id TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      joined_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (institute_id) REFERENCES institutes(id) ON DELETE CASCADE,
      FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(institute_id, student_id)
    );

    CREATE TABLE IF NOT EXISTS permanent_free_entitlements (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      reason TEXT NOT NULL,
      granted_by TEXT NOT NULL DEFAULT 'SYSTEM_POLICY',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS evaluation_materials (
      id TEXT PRIMARY KEY,
      level TEXT NOT NULL,
      material_type TEXT NOT NULL,
      model_group TEXT,
      subject_key TEXT NOT NULL,
      subject_name TEXT NOT NULL,
      paper TEXT DEFAULT 'Paper 1',
      attempt TEXT,
      syllabus_version TEXT DEFAULT 'New Scheme 2024',
      chapter_topic TEXT,
      question_paper_title TEXT NOT NULL,
      question_paper_text TEXT,
      suggested_answers_text TEXT,
      marking_scheme_text TEXT,
      reference_guidance_text TEXT,
      amendments_provisions_text TEXT,
      effective_date TEXT DEFAULT '2024-05-01',
      version TEXT DEFAULT '1.0',
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      uploaded_by TEXT DEFAULT 'ADMIN',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS evaluations (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      institute_id TEXT,
      assignment_id TEXT,
      level TEXT NOT NULL,
      material_type TEXT NOT NULL,
      model_group TEXT,
      subject_key TEXT NOT NULL,
      subject_name TEXT NOT NULL,
      paper TEXT,
      attempt TEXT,
      syllabus_version TEXT,
      material_id TEXT,
      material_version TEXT,
      model_used TEXT DEFAULT 'gemini-3.8-flash',
      checking_mode TEXT NOT NULL DEFAULT 'standard',
      original_filename TEXT NOT NULL,
      file_size INTEGER DEFAULT 0,
      document_validation_status TEXT NOT NULL DEFAULT 'VALID',
      rejection_reason TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING',
      confidence_score REAL DEFAULT 95.0,
      total_marks REAL DEFAULT 0,
      maximum_marks REAL DEFAULT 100,
      percentage REAL DEFAULT 0,
      grade TEXT,
      result_json TEXT,
      error_message TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT,
      FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS credit_ledger (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      amount INTEGER NOT NULL,
      source TEXT NOT NULL,
      balance_after INTEGER NOT NULL,
      order_id TEXT,
      payment_id TEXT,
      evaluation_id TEXT,
      note TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS payment_orders (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      razorpay_order_id TEXT UNIQUE NOT NULL,
      quantity INTEGER NOT NULL,
      amount_paise INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'INR',
      status TEXT NOT NULL DEFAULT 'PENDING',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS payment_transactions (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      razorpay_payment_id TEXT UNIQUE NOT NULL,
      razorpay_signature TEXT NOT NULL,
      amount_paise INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'SUCCESS',
      idempotency_key TEXT UNIQUE NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES payment_orders(id),
      FOREIGN KEY (student_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS institute_assignments (
      id TEXT PRIMARY KEY,
      institute_id TEXT NOT NULL,
      batch_id TEXT,
      title TEXT NOT NULL,
      subject_key TEXT NOT NULL,
      subject_name TEXT NOT NULL,
      maximum_marks REAL NOT NULL DEFAULT 100,
      instructions TEXT,
      time_limit_minutes INTEGER,
      deadline TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (institute_id) REFERENCES institutes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS assignment_submissions (
      id TEXT PRIMARY KEY,
      assignment_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      evaluation_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'EVALUATED',
      submitted_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (assignment_id) REFERENCES institute_assignments(id) ON DELETE CASCADE,
      FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (evaluation_id) REFERENCES evaluations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'SYSTEM',
      read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS support_tickets (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      subject TEXT NOT NULL,
      message TEXT NOT NULL,
      evaluation_id TEXT,
      status TEXT NOT NULL DEFAULT 'OPEN',
      admin_reply TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      details TEXT,
      ip_address TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS pricing_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      description TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS exam_attempts (
      id TEXT PRIMARY KEY,
      course TEXT NOT NULL,
      month TEXT NOT NULL,
      year INTEGER NOT NULL,
      display_name TEXT NOT NULL,
      syllabus_version TEXT NOT NULL DEFAULT 'New Scheme 2024',
      applicable_material_version TEXT DEFAULT '1.0',
      is_active INTEGER NOT NULL DEFAULT 1,
      start_date TEXT,
      end_date TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS institute_plans (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      price_inr INTEGER NOT NULL,
      billing_period TEXT NOT NULL DEFAULT 'MONTHLY',
      student_quota INTEGER NOT NULL,
      evaluation_credits INTEGER NOT NULL,
      features_json TEXT NOT NULL,
      assignments_enabled INTEGER NOT NULL DEFAULT 1,
      tests_enabled INTEGER NOT NULL DEFAULT 1,
      analytics_enabled INTEGER NOT NULL DEFAULT 1,
      support_tier TEXT NOT NULL DEFAULT 'PRIORITY',
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS referral_campaigns (
      code TEXT PRIMARY KEY,
      campaign_name TEXT NOT NULL,
      benefit_type TEXT NOT NULL DEFAULT '1_MONTH_FREE_ACCESS',
      benefit_duration_days INTEGER NOT NULL DEFAULT 30,
      max_redemptions INTEGER NOT NULL DEFAULT 20,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS referral_redemptions (
      id TEXT PRIMARY KEY,
      referral_code TEXT NOT NULL,
      user_id TEXT NOT NULL,
      user_email TEXT NOT NULL,
      benefit_type TEXT NOT NULL,
      redemption_number INTEGER NOT NULL,
      redeemed_at TEXT DEFAULT CURRENT_TIMESTAMP,
      expiry_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS account_suspensions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      internal_note TEXT,
      suspended_by TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'SUSPENDED',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS revocation_requests (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      suspension_id TEXT,
      appeal_reason TEXT NOT NULL,
      explanation TEXT NOT NULL,
      supporting_info TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING',
      admin_reply TEXT,
      admin_id TEXT,
      reviewed_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      device_id TEXT NOT NULL,
      device_name TEXT,
      ip_address TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      last_activity_at TEXT DEFAULT CURRENT_TIMESTAMP,
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_user_sessions_lookup ON user_sessions(user_id, status, expires_at);
    CREATE INDEX IF NOT EXISTS idx_user_sessions_device ON user_sessions(user_id, device_id);

    CREATE TABLE IF NOT EXISTS pricing_plans (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      billing_period TEXT NOT NULL,
      price_inr INTEGER NOT NULL,
      original_price_inr INTEGER,
      evaluation_allowance INTEGER NOT NULL,
      student_capacity INTEGER NOT NULL DEFAULT 1,
      unlimited_badge INTEGER NOT NULL DEFAULT 0,
      badge TEXT,
      benefits_json TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS student_credit_purchases (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      order_id TEXT,
      payment_id TEXT,
      credits_purchased INTEGER NOT NULL,
      credits_remaining INTEGER NOT NULL,
      valid_from TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      purchase_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_credit_purchases_user_status_expiry
    ON student_credit_purchases (user_id, status, expires_at);
  `);

  runMigrations();
  seedInitialData();
}

function runMigrations() {
  function addColumnIfNotExists(table: string, column: string, colDef: string) {
    try {
      const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
      if (!cols.some(c => c.name === column)) {
        // SQLite does not allow ALTER TABLE ADD COLUMN with non-constant defaults like CURRENT_TIMESTAMP
        let cleanDef = colDef;
        let requiresTimestampUpdate = false;
        if (/DEFAULT\s+CURRENT_TIMESTAMP/i.test(colDef)) {
          cleanDef = colDef.replace(/DEFAULT\s+CURRENT_TIMESTAMP/gi, '').trim();
          requiresTimestampUpdate = true;
        }
        db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${cleanDef}`).run();
        if (requiresTimestampUpdate) {
          db.prepare(`UPDATE ${table} SET ${column} = CURRENT_TIMESTAMP WHERE ${column} IS NULL`).run();
        }
      }
    } catch (err) {
      console.warn(`Migration check warning for ${table}.${column}:`, err);
    }
  }

  // Ensure evaluation_materials has all enhanced columns
  addColumnIfNotExists('evaluation_materials', 'source_type', "TEXT NOT NULL DEFAULT 'ADMIN'");
  addColumnIfNotExists('evaluation_materials', 'institute_id', "TEXT");
  addColumnIfNotExists('evaluation_materials', 'admin_approved', "INTEGER NOT NULL DEFAULT 0");
  addColumnIfNotExists('evaluation_materials', 'approved_by', "TEXT");
  addColumnIfNotExists('evaluation_materials', 'approved_at', "TEXT");
  addColumnIfNotExists('evaluation_materials', 'mtp_series', "TEXT");
  addColumnIfNotExists('evaluation_materials', 'paper', "TEXT DEFAULT 'Paper 1'");
  addColumnIfNotExists('evaluation_materials', 'syllabus_version', "TEXT DEFAULT 'New Scheme 2024'");
  addColumnIfNotExists('evaluation_materials', 'chapter_topic', 'TEXT');
  addColumnIfNotExists('evaluation_materials', 'reference_guidance_text', 'TEXT');
  addColumnIfNotExists('evaluation_materials', 'amendments_provisions_text', 'TEXT');
  addColumnIfNotExists('evaluation_materials', 'effective_date', "TEXT DEFAULT '2024-05-01'");
  addColumnIfNotExists('evaluation_materials', 'effective_to', 'TEXT');
  addColumnIfNotExists('evaluation_materials', 'version', "TEXT DEFAULT '1.0'");
  addColumnIfNotExists('evaluation_materials', 'status', "TEXT NOT NULL DEFAULT 'ACTIVE'");
  addColumnIfNotExists('evaluation_materials', 'question_paper_pdf_base64', 'TEXT');
  addColumnIfNotExists('evaluation_materials', 'suggested_answers_pdf_base64', 'TEXT');
  addColumnIfNotExists('evaluation_materials', 'marking_scheme_pdf_base64', 'TEXT');
  addColumnIfNotExists('evaluation_materials', 'reference_guidance_pdf_base64', 'TEXT');
  addColumnIfNotExists('evaluation_materials', 'amendments_pdf_base64', 'TEXT');
  addColumnIfNotExists('evaluation_materials', 'updated_at', 'TEXT');

  // Ensure evaluations has all enhanced columns
  addColumnIfNotExists('evaluations', 'evaluation_source', "TEXT DEFAULT 'PUBLIC'");
  addColumnIfNotExists('evaluations', 'institute_id', 'TEXT');
  addColumnIfNotExists('evaluations', 'institute_enrollment_id', 'TEXT');
  addColumnIfNotExists('evaluations', 'batch_id', 'TEXT');
  addColumnIfNotExists('evaluations', 'paper', 'TEXT');
  addColumnIfNotExists('evaluations', 'syllabus_version', 'TEXT');
  addColumnIfNotExists('evaluations', 'material_id', 'TEXT');
  addColumnIfNotExists('evaluations', 'material_version', 'TEXT');
  addColumnIfNotExists('evaluations', 'model_used', "TEXT DEFAULT 'gemini-3.8-flash'");
  addColumnIfNotExists('evaluations', 'annotations_json', 'TEXT');
  addColumnIfNotExists('evaluations', 'checked_copy_status', "TEXT DEFAULT 'PENDING'");
  addColumnIfNotExists('evaluations', 'original_page_count', 'INTEGER');
  addColumnIfNotExists('evaluations', 'checked_copy_page_count', 'INTEGER');
  addColumnIfNotExists('evaluations', 'model_provider', "TEXT DEFAULT 'gemini'");
  addColumnIfNotExists('evaluations', 'prompt_tokens', 'INTEGER');
  addColumnIfNotExists('evaluations', 'completion_tokens', 'INTEGER');
  addColumnIfNotExists('evaluations', 'total_tokens', 'INTEGER');
  addColumnIfNotExists('evaluations', 'latency_ms', 'INTEGER');
  addColumnIfNotExists('evaluations', 'fallback_occurred', 'INTEGER DEFAULT 0');
  addColumnIfNotExists('evaluations', 'fallback_reason', 'TEXT');
  addColumnIfNotExists('evaluations', 'model_display_name', 'TEXT');
  addColumnIfNotExists('evaluations', 'thinking_level', 'TEXT');
  addColumnIfNotExists('evaluations', 'routing_reason', 'TEXT');
  addColumnIfNotExists('evaluations', 'evaluation_engine_version', "TEXT DEFAULT '3.8.0-ca'");
  addColumnIfNotExists('evaluations', 'prompt_version', "TEXT DEFAULT 'v2026.1'");
  addColumnIfNotExists('evaluations', 'reference_material_ids', 'TEXT');
  addColumnIfNotExists('evaluations', 'model_answer_version', 'TEXT');
  addColumnIfNotExists('evaluations', 'marking_scheme_version', 'TEXT');
  addColumnIfNotExists('evaluations', 'retry_count', 'INTEGER DEFAULT 0');
  addColumnIfNotExists('evaluations', 'original_model', 'TEXT');
  addColumnIfNotExists('evaluations', 'fallback_model', 'TEXT');
  addColumnIfNotExists('evaluations', 'audit_metadata_json', 'TEXT');

  // Ensure institute_memberships columns
  addColumnIfNotExists('institute_memberships', 'removed_at', 'TEXT');
  addColumnIfNotExists('institute_memberships', 'sponsored_access', 'INTEGER DEFAULT 1');

  // Ensure student_profiles columns
  addColumnIfNotExists('student_profiles', 'city', 'TEXT');
  addColumnIfNotExists('student_profiles', 'preferred_subjects', 'TEXT');
  addColumnIfNotExists('student_profiles', 'avatar_url', 'TEXT');

  // Ensure model_configs table exists for Super Admin dynamic AI model controls
  db.exec(`
    CREATE TABLE IF NOT EXISTS model_configs (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'Primary',
      is_primary INTEGER NOT NULL DEFAULT 0,
      fallback_order INTEGER NOT NULL DEFAULT 1,
      thinking_level TEXT NOT NULL DEFAULT 'HIGH',
      temperature REAL NOT NULL DEFAULT 0.2,
      top_p REAL NOT NULL DEFAULT 0.95,
      max_tokens INTEGER NOT NULL DEFAULT 8192,
      is_enabled INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'AVAILABLE',
      last_latency_ms INTEGER DEFAULT 0,
      last_tested_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
  addColumnIfNotExists('model_configs', 'role', "TEXT NOT NULL DEFAULT 'Primary'");
  addColumnIfNotExists('model_configs', 'thinking_level', "TEXT NOT NULL DEFAULT 'HIGH'");

  // Ensure institute_memberships supports email-based invitation and pending state
  addColumnIfNotExists('institute_memberships', 'invited_email', 'TEXT');
  addColumnIfNotExists('institute_memberships', 'student_name', 'TEXT');
  addColumnIfNotExists('institute_memberships', 'notes', 'TEXT');

  // Ensure batches table supports target_attempt, capacity, and status
  addColumnIfNotExists('batches', 'target_attempt', "TEXT DEFAULT 'May 2026'");
  addColumnIfNotExists('batches', 'capacity', 'INTEGER DEFAULT 100');
  addColumnIfNotExists('batches', 'status', "TEXT DEFAULT 'ACTIVE'");

  // Ensure institute_materials table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS institute_materials (
      id TEXT PRIMARY KEY,
      institute_id TEXT NOT NULL,
      title TEXT NOT NULL,
      level TEXT NOT NULL,
      subject_key TEXT NOT NULL,
      subject_name TEXT NOT NULL,
      paper TEXT DEFAULT 'Paper 1',
      material_type TEXT DEFAULT 'TEST_SERIES',
      question_paper_text TEXT NOT NULL,
      question_paper_pdf_base64 TEXT,
      suggested_answers_text TEXT NOT NULL,
      suggested_answers_pdf_base64 TEXT,
      marking_scheme_text TEXT,
      marking_scheme_pdf_base64 TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (institute_id) REFERENCES institutes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS institute_tests (
      id TEXT PRIMARY KEY,
      institute_id TEXT NOT NULL,
      batch_id TEXT,
      title TEXT NOT NULL,
      level TEXT NOT NULL,
      subject_key TEXT NOT NULL,
      subject_name TEXT NOT NULL,
      paper TEXT DEFAULT 'Paper 1',
      checking_mode TEXT NOT NULL DEFAULT 'INSTITUTE_MATERIAL',
      institute_material_id TEXT,
      target_type TEXT NOT NULL DEFAULT 'ALL',
      selected_student_ids TEXT,
      maximum_marks REAL NOT NULL DEFAULT 100,
      time_limit_minutes INTEGER,
      deadline TEXT NOT NULL,
      instructions TEXT,
      status TEXT NOT NULL DEFAULT 'PUBLISHED',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (institute_id) REFERENCES institutes(id) ON DELETE CASCADE,
      FOREIGN KEY (institute_material_id) REFERENCES institute_materials(id) ON DELETE SET NULL
    );
  `);

  // Ensure support_tickets has all enhanced columns
  addColumnIfNotExists('support_tickets', 'ticket_number', 'TEXT');
  addColumnIfNotExists('support_tickets', 'category', "TEXT DEFAULT 'GENERAL'");
  addColumnIfNotExists('support_tickets', 'priority', "TEXT DEFAULT 'MEDIUM'");
  addColumnIfNotExists('support_tickets', 'role', "TEXT DEFAULT 'STUDENT'");
  addColumnIfNotExists('support_tickets', 'resolution_note', 'TEXT');
  addColumnIfNotExists('support_tickets', 'resolved_at', 'TEXT');

  // Pricing Plans Category & Capacity Columns
  addColumnIfNotExists('pricing_plans', 'category', "TEXT NOT NULL DEFAULT 'INSTITUTE'");
  addColumnIfNotExists('pricing_plans', 'min_students', 'INTEGER DEFAULT 0');
  addColumnIfNotExists('pricing_plans', 'max_students', 'INTEGER DEFAULT 0');
  addColumnIfNotExists('pricing_plans', 'tier_code', 'TEXT');
  addColumnIfNotExists('pricing_plans', 'is_custom', 'INTEGER DEFAULT 0');

  // Institute Subscriptions & Real Ledger
  db.exec(`
    CREATE TABLE IF NOT EXISTS institute_subscriptions (
      id TEXT PRIMARY KEY,
      institute_id TEXT NOT NULL,
      plan_id TEXT NOT NULL,
      billing_cycle TEXT NOT NULL DEFAULT 'MONTHLY',
      price_inr INTEGER NOT NULL,
      student_capacity INTEGER NOT NULL,
      evaluation_allowance INTEGER NOT NULL,
      evaluations_used INTEGER NOT NULL DEFAULT 0,
      evaluations_remaining INTEGER NOT NULL,
      payment_order_ref TEXT,
      payment_id TEXT,
      start_date TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expiry_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (institute_id) REFERENCES institutes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS institute_usage_ledger (
      id TEXT PRIMARY KEY,
      institute_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      evaluation_id TEXT,
      units_deducted INTEGER NOT NULL DEFAULT 1,
      balance_before INTEGER NOT NULL,
      balance_after INTEGER NOT NULL,
      action_type TEXT NOT NULL,
      idempotency_key TEXT UNIQUE,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (institute_id) REFERENCES institutes(id) ON DELETE CASCADE
    );
  `);

  // Institute Materials Enhancements
  addColumnIfNotExists('institute_materials', 'status', "TEXT NOT NULL DEFAULT 'ACTIVE'");
  addColumnIfNotExists('institute_materials', 'parsing_status', "TEXT NOT NULL DEFAULT 'ACTIVE'");
  addColumnIfNotExists('institute_materials', 'model_answer_text', 'TEXT');
  addColumnIfNotExists('institute_materials', 'model_answer_pdf_base64', 'TEXT');
  addColumnIfNotExists('institute_materials', 'amendments_text', 'TEXT');
  addColumnIfNotExists('institute_materials', 'amendments_pdf_base64', 'TEXT');

  // Institute Memberships Enhancements
  addColumnIfNotExists('institute_memberships', 'sponsored_access', 'INTEGER NOT NULL DEFAULT 1');
  addColumnIfNotExists('institute_memberships', 'removed_at', 'TEXT');

  // Student Subscription Validity (Preserved during suspension/revocation)
  addColumnIfNotExists('student_profiles', 'subscription_start_date', 'TEXT');
  addColumnIfNotExists('student_profiles', 'subscription_expiry_date', 'TEXT');

  // Suspension & Revocation Audit Enhancement
  addColumnIfNotExists('account_suspensions', 'previous_status', "TEXT DEFAULT 'ACTIVE'");
  addColumnIfNotExists('account_suspensions', 'suspended_at', 'TEXT');
  addColumnIfNotExists('account_suspensions', 'updated_at', 'TEXT');

  addColumnIfNotExists('revocation_requests', 'student_name', 'TEXT');
  addColumnIfNotExists('revocation_requests', 'student_email', 'TEXT');
  addColumnIfNotExists('revocation_requests', 'suspension_reason', 'TEXT');
  addColumnIfNotExists('revocation_requests', 'attachments_json', 'TEXT');
  addColumnIfNotExists('revocation_requests', 'admin_decision', 'TEXT');
  addColumnIfNotExists('revocation_requests', 'admin_response', 'TEXT');
  addColumnIfNotExists('revocation_requests', 'reviewed_by', 'TEXT');
  addColumnIfNotExists('revocation_requests', 'submitted_at', 'TEXT');

  // Strict Material Ownership Rule:
  // Identify legacy automatically seeded/demo materials and deactivate them
  // (Mark as UNVERIFIED, admin_approved = 0, remove from ACTIVE evaluation pool)
  try {
    db.prepare(`
      UPDATE evaluation_materials 
      SET status = 'UNVERIFIED', 
          admin_approved = 0,
          uploaded_by = 'LEGACY_SEED'
      WHERE uploaded_by = 'SYSTEM_SEED' OR id LIKE 'mat_%_mtp_1'
    `).run();
  } catch (err) {
    console.warn('Material cleanup warning:', err);
  }

  // Safe Historical Credit Migration & Expiry Calculation
  try {
    const unrecordedOrders = db.prepare(`
      SELECT o.id, o.student_id, o.quantity, o.created_at, t.razorpay_payment_id
      FROM payment_orders o
      LEFT JOIN payment_transactions t ON t.order_id = o.id
      LEFT JOIN student_credit_purchases p ON p.order_id = o.id
      WHERE o.status = 'SUCCESS' AND p.id IS NULL
    `).all() as Array<{
      id: string;
      student_id: string;
      quantity: number;
      created_at: string;
      razorpay_payment_id: string | null;
    }>;

    for (const ord of unrecordedOrders) {
      const pDate = new Date(ord.created_at || new Date().toISOString());
      const expDate = new Date(pDate.getTime());
      const targetM = (expDate.getMonth() + 3) % 12;
      expDate.setMonth(expDate.getMonth() + 3);
      if (expDate.getMonth() !== targetM) expDate.setDate(0);
      const isExpired = expDate.getTime() <= Date.now();

      db.prepare(`
        INSERT OR IGNORE INTO student_credit_purchases (
          id, user_id, order_id, payment_id, credits_purchased, credits_remaining,
          valid_from, expires_at, purchase_date, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        `crd_${Math.random().toString(36).substring(2, 10)}`,
        ord.student_id,
        ord.id,
        ord.razorpay_payment_id || null,
        ord.quantity,
        isExpired ? 0 : ord.quantity,
        pDate.toISOString(),
        expDate.toISOString(),
        pDate.toISOString(),
        isExpired ? 'EXPIRED' : 'ACTIVE',
        pDate.toISOString()
      );
    }
  } catch (err) {
    console.warn('Historical credit migration warning:', err);
  }

  // Student Profiles enhancements (City, preferred subjects, avatar URL)
  addColumnIfNotExists('student_profiles', 'city', 'TEXT');
  addColumnIfNotExists('student_profiles', 'preferred_subjects', 'TEXT');
  addColumnIfNotExists('student_profiles', 'avatar_url', 'TEXT');
  addColumnIfNotExists('student_profiles', 'updated_at', 'TEXT');

  // Referral campaigns & redemptions tracking enhancements
  addColumnIfNotExists('referral_campaigns', 'max_evaluations', 'INTEGER NOT NULL DEFAULT 15');
  addColumnIfNotExists('referral_campaigns', 'description', 'TEXT');
  addColumnIfNotExists('referral_campaigns', 'status', "TEXT NOT NULL DEFAULT 'ACTIVE'");
  addColumnIfNotExists('referral_campaigns', 'start_date', 'TEXT');
  addColumnIfNotExists('referral_campaigns', 'end_date', 'TEXT');
  addColumnIfNotExists('referral_campaigns', 'user_type', "TEXT NOT NULL DEFAULT 'ALL'");
  addColumnIfNotExists('referral_campaigns', 'terms_notes', 'TEXT');
  addColumnIfNotExists('referral_campaigns', 'updated_at', 'TEXT');

  addColumnIfNotExists('referral_redemptions', 'max_evaluations', 'INTEGER NOT NULL DEFAULT 15');
  addColumnIfNotExists('referral_redemptions', 'evaluations_used', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfNotExists('referral_redemptions', 'evaluations_remaining', 'INTEGER NOT NULL DEFAULT 15');
  addColumnIfNotExists('referral_redemptions', 'audit_note', 'TEXT');
  addColumnIfNotExists('referral_redemptions', 'start_date', 'TEXT');
  addColumnIfNotExists('referral_redemptions', 'updated_at', 'TEXT');

  // Unique constraint to prevent duplicate redemptions per user per code
  try {
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_redemptions_code_user 
      ON referral_redemptions(referral_code, user_id);
    `);
  } catch (err) {
    console.warn('Index creation warning:', err);
  }
}

function seedInitialData() {
  // 1. Seed Super Admin & Support Admin with secure server-side ADMIN_PASSWORD
  const adminPassword = process.env.ADMIN_PASSWORD || 'BgMi@2006';
  const superAdminHash = hashPassword(adminPassword);
  const supportAdminHash = hashPassword('Admin@CA2026!');

  const admins = [
    { id: 'usr_super_admin_001', email: 'admin@caexamchecker.ai', name: 'Super Administrator', role: 'SUPER_ADMIN', hash: superAdminHash },
    { id: 'usr_super_admin_002', email: 'superadmin@ca-exam-checker.com', name: 'Super Administrator', role: 'SUPER_ADMIN', hash: superAdminHash },
    { id: 'usr_admin_support_002', email: 'caexamchecker.support@gmail.com', name: 'CA Exam Checker Support Admin', role: 'ADMIN', hash: supportAdminHash },
  ];

  for (const adm of admins) {
    const existingAdmin = db.prepare('SELECT id FROM users WHERE email = ?').get(adm.email);
    if (!existingAdmin) {
      db.prepare(`
        INSERT INTO users (id, email, password_hash, full_name, phone, role, status)
        VALUES (?, ?, ?, ?, '+919876543210', ?, 'ACTIVE')
      `).run(adm.id, adm.email, adm.hash, adm.name, adm.role);

      db.prepare(`
        INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details)
        VALUES (?, ?, 'INITIALIZE_SYSTEM', 'USER', ?, ?)
      `).run(`log_init_${adm.id}`, adm.id, adm.id, `Created ${adm.role} account`);
    } else if (adm.role === 'SUPER_ADMIN') {
      const curr = db.prepare('SELECT status FROM users WHERE email = ?').get(adm.email) as { status: string } | undefined;
      if (curr && curr.status !== 'ACTIVE') {
        db.prepare(`
          INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details)
          VALUES (?, ?, 'SUPER_ADMIN_RECOVERY', 'USER', ?, 'Restored primary Super Admin from suspended state to ACTIVE')
        `).run(`log_rec_${Date.now()}`, adm.id, adm.id);
      }
      // Keep super admin password hash synchronized with server ADMIN_PASSWORD & enforce ACTIVE status
      db.prepare(`
        UPDATE users SET password_hash = ?, status = 'ACTIVE' WHERE email = ?
      `).run(adm.hash, adm.email);
    }
  }

  // 2. Permanent Free Entitlements
  const permanentEmails = [
    { email: 'adityakumart484@gmail.com', reason: 'Core Founder / Verified System Lifetime Access' },
    { email: 'manug8158@gmail.com', reason: 'Core Founder / Verified System Lifetime Access' }
  ];

  for (const item of permanentEmails) {
    const normalizedEmail = item.email.toLowerCase();
    const existing = db.prepare('SELECT id FROM permanent_free_entitlements WHERE lower(email) = ?').get(normalizedEmail);
    if (!existing) {
      const id = `pfe_${Buffer.from(normalizedEmail).toString('hex').slice(0, 12)}`;
      db.prepare(`
        INSERT INTO permanent_free_entitlements (id, email, reason, granted_by, is_active)
        VALUES (?, ?, ?, 'SYSTEM_BOOTSTRAP', 1)
      `).run(id, normalizedEmail, item.reason);
    } else {
      // Ensure is_active is 1
      db.prepare('UPDATE permanent_free_entitlements SET is_active = 1 WHERE lower(email) = ?').run(normalizedEmail);
    }
  }

  // 3. Pricing & Evaluation Settings Configuration
  const defaultPricing = [
    { key: 'PRICE_PER_CREDIT_INR', value: '10', description: 'Price in INR for single evaluation credit' },
    { key: 'FREE_TIER_EVALUATIONS', value: '2', description: 'Number of free evaluations for normal individual students' },
    { key: 'DEFAULT_INSTITUTE_QUOTA', value: '500', description: 'Default student allocation per institute' },
    { key: 'SUPPORT_EMAIL', value: 'caexamchecker.support@gmail.com', description: 'Official support email' },
    { key: 'INSTAGRAM_URL', value: 'https://insta.openinapp.co/utw2r', description: 'Official Instagram support link' },
    { key: 'EVAL_CHECKING_MODE', value: 'standard', description: 'Default checking strictness mode (standard, strict, lenient)' },
    { key: 'EVAL_MODEL_PROVIDER', value: 'gemini-3.8-flash', description: 'Primary AI model provider for examination evaluation' },
    { key: 'EVAL_CONFIDENCE_THRESHOLD', value: '75', description: 'Minimum confidence percentage threshold for evaluation audit' },
    { key: 'EVAL_STEP_MARKING_ENABLED', value: 'true', description: 'Enforce question-wise step marking breakdown' },
    { key: 'EVAL_CONSEQUENTIAL_ERROR_ENABLED', value: 'true', description: 'Award subsequent step marks if earlier step has calculation slip' },
    { key: 'EVAL_MCQ_NEGATIVE_MARKING', value: 'ZERO_FOR_ALL', description: 'Zero negative marking for all CA MCQs (Foundation, Intermediate, Final)' },
    { key: 'EVAL_EQUIVALENT_ANSWER_DETECTION', value: 'true', description: 'Accept valid alternate methods and equivalent statutory interpretations' },
    { key: 'EVAL_MATERIAL_PRIORITY', value: 'ACTIVE_LATEST_VERSION', description: 'Priority rule for matching evaluation materials' },
    { key: 'EVAL_FALLBACK_MODEL', value: 'gemini-3.6-flash', description: 'Secondary fallback AI model for high-demand 503 conditions' },
    { key: 'EVAL_MAX_RETRIES', value: '3', description: 'Maximum retry attempts with exponential backoff for transient Gemini API errors' },
    { key: 'EVAL_TIMEOUT_SECONDS', value: '90', description: 'Maximum request timeout in seconds for AI evaluation call' },
    { key: 'REFERRAL_AI30_MAX_USERS', value: '20', description: 'Maximum eligible referred users cap for promo code AI30' },
    { key: 'REFERRAL_AI30_BENEFIT_MONTHS', value: '1', description: 'Free evaluation benefit duration in months for AI30' },
    { key: 'REFERRAL_AI30_ACTIVE', value: 'true', description: 'Whether promo code AI30 is currently active for redemption' },
  ];

  for (const p of defaultPricing) {
    const existing = db.prepare('SELECT key FROM pricing_settings WHERE key = ?').get(p.key);
    if (!existing) {
      db.prepare('INSERT INTO pricing_settings (key, value, description) VALUES (?, ?, ?)').run(p.key, p.value, p.description);
    }
  }

  // 4. Seed Configurable Course Exam Attempts
  seedExamAttempts();

  // 5. Seed Configurable Institute Pricing Plans
  seedInstitutePlans();
  seedPricingPlans();

  // 5b. Seed Multi-Model Provider AI Configurations
  seedModelConfigs();

  // 6. Seed Referral Campaigns (AI30)
  seedReferralCampaigns();

  // 7. STRICT MATERIAL RULE (Rule 38 & Rule 67):
  // Never automatically seed or create examination materials.
  // All Global CA examination materials must be explicitly uploaded and approved by an authorized Admin.
  // seedEvaluationMaterials() is intentionally disabled.

  // 8. Seed a Model Institute so institutional sponsorship and batch management can be verified
  seedSampleInstitute();
}

function seedExamAttempts() {
  const attempts = [
    // CA Foundation Attempts (January, May, September)
    { id: 'att_fnd_sep27', course: 'FOUNDATION', month: 'September', year: 2027, display_name: 'September 2027', syllabus_version: 'New Scheme 2024' },
    { id: 'att_fnd_may27', course: 'FOUNDATION', month: 'May', year: 2027, display_name: 'May 2027', syllabus_version: 'New Scheme 2024' },
    { id: 'att_fnd_jan27', course: 'FOUNDATION', month: 'January', year: 2027, display_name: 'January 2027', syllabus_version: 'New Scheme 2024' },
    { id: 'att_fnd_sep26', course: 'FOUNDATION', month: 'September', year: 2026, display_name: 'September 2026', syllabus_version: 'New Scheme 2024' },
    { id: 'att_fnd_may26', course: 'FOUNDATION', month: 'May', year: 2026, display_name: 'May 2026', syllabus_version: 'New Scheme 2024' },
    { id: 'att_fnd_jan26', course: 'FOUNDATION', month: 'January', year: 2026, display_name: 'January 2026', syllabus_version: 'New Scheme 2024' },

    // CA Intermediate Attempts (January, May, September)
    { id: 'att_int_jan28', course: 'INTERMEDIATE', month: 'January', year: 2028, display_name: 'January 2028', syllabus_version: 'New Scheme 2024' },
    { id: 'att_int_sep27', course: 'INTERMEDIATE', month: 'September', year: 2027, display_name: 'September 2027', syllabus_version: 'New Scheme 2024' },
    { id: 'att_int_may27', course: 'INTERMEDIATE', month: 'May', year: 2027, display_name: 'May 2027', syllabus_version: 'New Scheme 2024' },
    { id: 'att_int_jan27', course: 'INTERMEDIATE', month: 'January', year: 2027, display_name: 'January 2027', syllabus_version: 'New Scheme 2024' },
    { id: 'att_int_sep26', course: 'INTERMEDIATE', month: 'September', year: 2026, display_name: 'September 2026', syllabus_version: 'New Scheme 2024' },
    { id: 'att_int_may26', course: 'INTERMEDIATE', month: 'May', year: 2026, display_name: 'May 2026', syllabus_version: 'New Scheme 2024' },

    // CA Final Attempts (May, November)
    { id: 'att_fin_nov27', course: 'FINAL', month: 'November', year: 2027, display_name: 'November 2027', syllabus_version: 'New Scheme 2024' },
    { id: 'att_fin_may27', course: 'FINAL', month: 'May', year: 2027, display_name: 'May 2027', syllabus_version: 'New Scheme 2024' },
    { id: 'att_fin_nov26', course: 'FINAL', month: 'November', year: 2026, display_name: 'November 2026', syllabus_version: 'New Scheme 2024' },
    { id: 'att_fin_may26', course: 'FINAL', month: 'May', year: 2026, display_name: 'May 2026', syllabus_version: 'New Scheme 2024' },
  ];

  for (const att of attempts) {
    const existing = db.prepare('SELECT id FROM exam_attempts WHERE id = ?').get(att.id);
    if (!existing) {
      db.prepare(`
        INSERT INTO exam_attempts (id, course, month, year, display_name, syllabus_version, is_active)
        VALUES (?, ?, ?, ?, ?, ?, 1)
      `).run(att.id, att.course, att.month, att.year, att.display_name, att.syllabus_version);
    }
  }
}

function seedInstitutePlans() {
  const institutePlans = [
    // MONTHLY
    {
      id: 'institute-starter-monthly',
      name: 'Starter',
      price_inr: 3999,
      billing_period: 'MONTHLY',
      student_quota: 2000,
      evaluation_credits: 2500,
      features_json: JSON.stringify([
        'Foundation, Intermediate, Final (All levels included)',
        'All Subjects included',
        'Student capacity: Up to 2,000 students',
        'AI evaluation allowance: 2,500 evaluations/month',
        'Student management & Batch management',
        'Tests & Assignments module',
        'AI evaluation with Question-wise grading',
        'Detailed diagnostic reports & Checked-copy PDF',
        'Basic analytics & Standard email support',
      ]),
      assignments_enabled: 1,
      tests_enabled: 1,
      analytics_enabled: 1,
      support_tier: 'STANDARD',
      is_active: 1,
      sort_order: 1,
    },
    {
      id: 'institute-growth-monthly',
      name: 'Growth',
      price_inr: 7999,
      billing_period: 'MONTHLY',
      student_quota: 5000,
      evaluation_credits: 6000,
      features_json: JSON.stringify([
        'Foundation, Intermediate, Final (All levels included)',
        'All Subjects included',
        'Student capacity: Up to 5,000 students',
        'AI evaluation allowance: 6,000 evaluations/month',
        'Includes everything in Starter plus:',
        'Advanced analytics & Batch performance analytics',
        'Advanced tests & Full 3-Hour Mock tests',
        'Faculty and admin tools with role permissions',
        'Priority support (WhatsApp & Email)',
      ]),
      assignments_enabled: 1,
      tests_enabled: 1,
      analytics_enabled: 1,
      support_tier: 'PRIORITY',
      is_active: 1,
      sort_order: 2,
    },
    {
      id: 'institute-professional-monthly',
      name: 'Professional',
      price_inr: 14999,
      billing_period: 'MONTHLY',
      student_quota: 10000,
      evaluation_credits: 12000,
      features_json: JSON.stringify([
        'Foundation, Intermediate, Final (All levels included)',
        'All Subjects included',
        'Student capacity: Up to 10,000 students',
        'AI evaluation allowance: 12,000 evaluations/month',
        'Large student management & Advanced batch management',
        'Advanced comparative analytics & Faculty tools',
        'Tests, Assignments, and Mock tests',
        'Detailed reports & Authentic evaluated copies',
        'Priority support with fast response SLA',
      ]),
      assignments_enabled: 1,
      tests_enabled: 1,
      analytics_enabled: 1,
      support_tier: 'PRIORITY',
      is_active: 1,
      sort_order: 3,
    },
    {
      id: 'institute-enterprise-monthly',
      name: 'Enterprise',
      price_inr: 29999,
      billing_period: 'MONTHLY',
      student_quota: 25000,
      evaluation_credits: 27500,
      features_json: JSON.stringify([
        'Foundation, Intermediate, Final (All levels included)',
        'All Subjects included',
        'Student capacity: Up to 25,000 students',
        'AI evaluation allowance: 27,500 evaluations/month',
        'Enterprise analytics & Large-scale batch management',
        'Advanced institutional reporting & Multi-faculty accounts',
        'Higher processing capacity & Queue prioritization',
        'Priority support with Dedicated Account Lead',
      ]),
      assignments_enabled: 1,
      tests_enabled: 1,
      analytics_enabled: 1,
      support_tier: 'DEDICATED_SLA',
      is_active: 1,
      sort_order: 4,
    },
    {
      id: 'institute-scale-monthly',
      name: 'Scale',
      price_inr: 54999,
      billing_period: 'MONTHLY',
      student_quota: 50000,
      evaluation_credits: 55000,
      features_json: JSON.stringify([
        'Foundation, Intermediate, Final (All levels included)',
        'All Subjects included',
        'Student capacity: Up to 50,000 students',
        'AI evaluation allowance: 55,000 evaluations/month',
        'Advanced institutional analytics & Multi-campus reporting',
        'Large-scale tests & High-concurrency processing',
        'Advanced batch & faculty management',
        '24/7 Priority support & Dedicated SLA',
      ]),
      assignments_enabled: 1,
      tests_enabled: 1,
      analytics_enabled: 1,
      support_tier: 'DEDICATED_SLA',
      is_active: 1,
      sort_order: 5,
    },
    // ANNUAL PLANS (~17% SAVINGS)
    {
      id: 'institute-starter-annual',
      name: 'Starter',
      price_inr: 39999,
      billing_period: 'ANNUAL',
      student_quota: 2000,
      evaluation_credits: 30000,
      features_json: JSON.stringify([
        'Foundation, Intermediate, Final (All levels included)',
        'All Subjects included',
        'Student capacity: Up to 2,000 students',
        'AI evaluation allowance: 30,000 evaluations/year',
        'Save ~17% with annual commitment',
        'Student management & Batch management',
        'Tests, Assignments, Question-wise step marking',
        'Detailed diagnostic reports & Checked-copy PDF',
        'Basic analytics & Standard support',
      ]),
      assignments_enabled: 1,
      tests_enabled: 1,
      analytics_enabled: 1,
      support_tier: 'STANDARD',
      is_active: 1,
      sort_order: 6,
    },
    {
      id: 'institute-growth-annual',
      name: 'Growth',
      price_inr: 79999,
      billing_period: 'ANNUAL',
      student_quota: 5000,
      evaluation_credits: 72000,
      features_json: JSON.stringify([
        'Foundation, Intermediate, Final (All levels included)',
        'All Subjects included',
        'Student capacity: Up to 5,000 students',
        'AI evaluation allowance: 72,000 evaluations/year',
        'Save ~17% with annual commitment',
        'Advanced analytics & Batch performance benchmarks',
        'Advanced tests, Full Mock tests & Faculty tools',
        'Priority support (WhatsApp & Email)',
      ]),
      assignments_enabled: 1,
      tests_enabled: 1,
      analytics_enabled: 1,
      support_tier: 'PRIORITY',
      is_active: 1,
      sort_order: 7,
    },
    {
      id: 'institute-professional-annual',
      name: 'Professional',
      price_inr: 149999,
      billing_period: 'ANNUAL',
      student_quota: 10000,
      evaluation_credits: 144000,
      features_json: JSON.stringify([
        'Foundation, Intermediate, Final (All levels included)',
        'All Subjects included',
        'Student capacity: Up to 10,000 students',
        'AI evaluation allowance: 144,000 evaluations/year',
        'Save ~17% with annual commitment',
        'Large student management & Advanced batch management',
        'Advanced analytics, Faculty tools & Mock tests',
        'Priority support with expedited resolution SLA',
      ]),
      assignments_enabled: 1,
      tests_enabled: 1,
      analytics_enabled: 1,
      support_tier: 'PRIORITY',
      is_active: 1,
      sort_order: 8,
    },
    {
      id: 'institute-enterprise-annual',
      name: 'Enterprise',
      price_inr: 299999,
      billing_period: 'ANNUAL',
      student_quota: 25000,
      evaluation_credits: 330000,
      features_json: JSON.stringify([
        'Foundation, Intermediate, Final (All levels included)',
        'All Subjects included',
        'Student capacity: Up to 25,000 students',
        'AI evaluation allowance: 330,000 evaluations/year',
        'Save ~17% with annual commitment',
        'Enterprise analytics & Large-scale batch management',
        'Advanced institutional reporting & Multi-faculty accounts',
        'Higher processing capacity & Dedicated Account Lead',
      ]),
      assignments_enabled: 1,
      tests_enabled: 1,
      analytics_enabled: 1,
      support_tier: 'DEDICATED_SLA',
      is_active: 1,
      sort_order: 9,
    },
    {
      id: 'institute-scale-annual',
      name: 'Scale',
      price_inr: 549999,
      billing_period: 'ANNUAL',
      student_quota: 50000,
      evaluation_credits: 660000,
      features_json: JSON.stringify([
        'Foundation, Intermediate, Final (All levels included)',
        'All Subjects included',
        'Student capacity: Up to 50,000 students',
        'AI evaluation allowance: 660,000 evaluations/year',
        'Save ~17% with annual commitment',
        'Advanced analytics & Multi-campus institutional reporting',
        'Large-scale tests & High-volume processing',
        'Faculty/admin management & 24/7 Dedicated SLA',
      ]),
      assignments_enabled: 1,
      tests_enabled: 1,
      analytics_enabled: 1,
      support_tier: 'DEDICATED_SLA',
      is_active: 1,
      sort_order: 10,
    },
  ];

  for (const p of institutePlans) {
    const existing = db.prepare('SELECT id FROM institute_plans WHERE id = ?').get(p.id);
    if (!existing) {
      db.prepare(`
        INSERT INTO institute_plans (
          id, name, price_inr, billing_period, student_quota, evaluation_credits,
          features_json, assignments_enabled, tests_enabled, analytics_enabled,
          support_tier, is_active, sort_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        p.id, p.name, p.price_inr, p.billing_period, p.student_quota, p.evaluation_credits,
        p.features_json, p.assignments_enabled, p.tests_enabled, p.analytics_enabled,
        p.support_tier, p.is_active, p.sort_order
      );
    } else {
      db.prepare(`
        UPDATE institute_plans SET
          name = ?, price_inr = ?, billing_period = ?, student_quota = ?, evaluation_credits = ?,
          features_json = ?, support_tier = ?, is_active = 1, sort_order = ?
        WHERE id = ?
      `).run(p.name, p.price_inr, p.billing_period, p.student_quota, p.evaluation_credits, p.features_json, p.support_tier, p.sort_order, p.id);
    }
  }
}

export function seedPricingPlans() {
  const plans = [
    // === 1. INSTITUTE MONTHLY PLANS ===
    {
      id: 'institute-starter-monthly',
      name: 'Starter',
      category: 'INSTITUTE',
      billing_period: 'MONTHLY',
      price_inr: 3999,
      original_price_inr: 4999,
      evaluation_allowance: 2500,
      student_capacity: 2000,
      unlimited_badge: 0,
      badge: null,
      min_students: 1,
      max_students: 2000,
      tier_code: 'STARTER',
      is_custom: 0,
      benefits_json: JSON.stringify([
        'Foundation, Intermediate, Final (All levels included)',
        'All Subjects included',
        'Student capacity: Up to 2,000 students',
        'AI evaluation allowance: 2,500 evaluations/month',
        'Student management & Batch management',
        'Tests & Assignments module',
        'AI evaluation with Question-wise grading',
        'Detailed diagnostic reports & Checked-copy PDF',
        'Basic analytics & Standard email support',
      ]),
      is_active: 1,
      sort_order: 1,
    },
    {
      id: 'institute-growth-monthly',
      name: 'Growth',
      category: 'INSTITUTE',
      billing_period: 'MONTHLY',
      price_inr: 7999,
      original_price_inr: 9999,
      evaluation_allowance: 6000,
      student_capacity: 5000,
      unlimited_badge: 0,
      badge: 'MOST POPULAR',
      min_students: 2001,
      max_students: 5000,
      tier_code: 'GROWTH',
      is_custom: 0,
      benefits_json: JSON.stringify([
        'Foundation, Intermediate, Final (All levels included)',
        'All Subjects included',
        'Student capacity: Up to 5,000 students',
        'AI evaluation allowance: 6,000 evaluations/month',
        'Includes everything in Starter plus:',
        'Advanced analytics & Batch performance analytics',
        'Advanced tests & Full 3-Hour Mock tests',
        'Faculty and admin tools with role permissions',
        'Priority support (WhatsApp & Email)',
      ]),
      is_active: 1,
      sort_order: 2,
    },
    {
      id: 'institute-professional-monthly',
      name: 'Professional',
      category: 'INSTITUTE',
      billing_period: 'MONTHLY',
      price_inr: 14999,
      original_price_inr: 18999,
      evaluation_allowance: 12000,
      student_capacity: 10000,
      unlimited_badge: 0,
      badge: null,
      min_students: 5001,
      max_students: 10000,
      tier_code: 'PROFESSIONAL',
      is_custom: 0,
      benefits_json: JSON.stringify([
        'Foundation, Intermediate, Final (All levels included)',
        'All Subjects included',
        'Student capacity: Up to 10,000 students',
        'AI evaluation allowance: 12,000 evaluations/month',
        'Large student management & Advanced batch management',
        'Advanced comparative analytics & Faculty tools',
        'Tests, Assignments, and Mock tests',
        'Detailed reports & Authentic evaluated copies',
        'Priority support with fast response SLA',
      ]),
      is_active: 1,
      sort_order: 3,
    },
    {
      id: 'institute-enterprise-monthly',
      name: 'Enterprise',
      category: 'INSTITUTE',
      billing_period: 'MONTHLY',
      price_inr: 29999,
      original_price_inr: 37999,
      evaluation_allowance: 27500,
      student_capacity: 25000,
      unlimited_badge: 0,
      badge: null,
      min_students: 10001,
      max_students: 25000,
      tier_code: 'ENTERPRISE',
      is_custom: 0,
      benefits_json: JSON.stringify([
        'Foundation, Intermediate, Final (All levels included)',
        'All Subjects included',
        'Student capacity: Up to 25,000 students',
        'AI evaluation allowance: 27,500 evaluations/month',
        'Enterprise analytics & Large-scale batch management',
        'Advanced institutional reporting & Multi-faculty accounts',
        'Higher processing capacity & Queue prioritization',
        'Priority support with Dedicated Account Lead',
      ]),
      is_active: 1,
      sort_order: 4,
    },
    {
      id: 'institute-scale-monthly',
      name: 'Scale',
      category: 'INSTITUTE',
      billing_period: 'MONTHLY',
      price_inr: 54999,
      original_price_inr: 69999,
      evaluation_allowance: 55000,
      student_capacity: 50000,
      unlimited_badge: 0,
      badge: null,
      min_students: 25001,
      max_students: 50000,
      tier_code: 'SCALE',
      is_custom: 0,
      benefits_json: JSON.stringify([
        'Foundation, Intermediate, Final (All levels included)',
        'All Subjects included',
        'Student capacity: Up to 50,000 students',
        'AI evaluation allowance: 55,000 evaluations/month',
        'Advanced institutional analytics & Multi-campus reporting',
        'Large-scale tests & High-concurrency processing',
        'Advanced batch & faculty management',
        '24/7 Priority support & Dedicated SLA',
      ]),
      is_active: 1,
      sort_order: 5,
    },

    // === 2. INSTITUTE ANNUAL PLANS (SAVE ~17%) ===
    {
      id: 'institute-starter-annual',
      name: 'Starter',
      category: 'INSTITUTE',
      billing_period: 'ANNUAL',
      price_inr: 39999,
      original_price_inr: 47988,
      evaluation_allowance: 30000,
      student_capacity: 2000,
      unlimited_badge: 0,
      badge: 'Save 17%',
      min_students: 1,
      max_students: 2000,
      tier_code: 'STARTER',
      is_custom: 0,
      benefits_json: JSON.stringify([
        'Foundation, Intermediate, Final (All levels included)',
        'All Subjects included',
        'Student capacity: Up to 2,000 students',
        'AI evaluation allowance: 30,000 evaluations/year',
        'Save ~17% compared to monthly billing',
        'Student management & Batch management',
        'Tests, Assignments & AI evaluation',
        'Detailed diagnostic reports & Checked-copy PDF',
        'Basic analytics & Standard support',
      ]),
      is_active: 1,
      sort_order: 6,
    },
    {
      id: 'institute-growth-annual',
      name: 'Growth',
      category: 'INSTITUTE',
      billing_period: 'ANNUAL',
      price_inr: 79999,
      original_price_inr: 95988,
      evaluation_allowance: 72000,
      student_capacity: 5000,
      unlimited_badge: 0,
      badge: 'MOST POPULAR (Save 17%)',
      min_students: 2001,
      max_students: 5000,
      tier_code: 'GROWTH',
      is_custom: 0,
      benefits_json: JSON.stringify([
        'Foundation, Intermediate, Final (All levels included)',
        'All Subjects included',
        'Student capacity: Up to 5,000 students',
        'AI evaluation allowance: 72,000 evaluations/year',
        'Save ~17% compared to monthly billing',
        'Advanced analytics & Batch performance analytics',
        'Advanced tests & Mock tests',
        'Faculty and admin tools with role permissions',
        'Priority support (WhatsApp & Email)',
      ]),
      is_active: 1,
      sort_order: 7,
    },
    {
      id: 'institute-professional-annual',
      name: 'Professional',
      category: 'INSTITUTE',
      billing_period: 'ANNUAL',
      price_inr: 149999,
      original_price_inr: 179988,
      evaluation_allowance: 144000,
      student_capacity: 10000,
      unlimited_badge: 0,
      badge: 'Save 17%',
      min_students: 5001,
      max_students: 10000,
      tier_code: 'PROFESSIONAL',
      is_custom: 0,
      benefits_json: JSON.stringify([
        'Foundation, Intermediate, Final (All levels included)',
        'All Subjects included',
        'Student capacity: Up to 10,000 students',
        'AI evaluation allowance: 144,000 evaluations/year',
        'Save ~17% compared to monthly billing',
        'Large student management & Advanced batch management',
        'Advanced comparative analytics & Faculty tools',
        'Tests, Assignments, and Mock tests',
        'Priority support with fast response SLA',
      ]),
      is_active: 1,
      sort_order: 8,
    },
    {
      id: 'institute-enterprise-annual',
      name: 'Enterprise',
      category: 'INSTITUTE',
      billing_period: 'ANNUAL',
      price_inr: 299999,
      original_price_inr: 359988,
      evaluation_allowance: 330000,
      student_capacity: 25000,
      unlimited_badge: 0,
      badge: 'Save 17%',
      min_students: 10001,
      max_students: 25000,
      tier_code: 'ENTERPRISE',
      is_custom: 0,
      benefits_json: JSON.stringify([
        'Foundation, Intermediate, Final (All levels included)',
        'All Subjects included',
        'Student capacity: Up to 25,000 students',
        'AI evaluation allowance: 330,000 evaluations/year',
        'Save ~17% compared to monthly billing',
        'Enterprise analytics & Large-scale batch management',
        'Advanced institutional reporting & Multi-faculty accounts',
        'Priority support with Dedicated Account Lead',
      ]),
      is_active: 1,
      sort_order: 9,
    },
    {
      id: 'institute-scale-annual',
      name: 'Scale',
      category: 'INSTITUTE',
      billing_period: 'ANNUAL',
      price_inr: 549999,
      original_price_inr: 659988,
      evaluation_allowance: 660000,
      student_capacity: 50000,
      unlimited_badge: 0,
      badge: 'Save 17%',
      min_students: 25001,
      max_students: 50000,
      tier_code: 'SCALE',
      is_custom: 0,
      benefits_json: JSON.stringify([
        'Foundation, Intermediate, Final (All levels included)',
        'All Subjects included',
        'Student capacity: Up to 50,000 students',
        'AI evaluation allowance: 660,000 evaluations/year',
        'Save ~17% compared to monthly billing',
        'Advanced analytics & Multi-campus institutional reporting',
        'Large-scale tests & High-volume processing capacity',
        'Faculty/admin management & 24/7 Dedicated SLA',
      ]),
      is_active: 1,
      sort_order: 10,
    },

    // === 3. 50,000+ MEGA ENTERPRISE TIERS (ANNUAL ONLY) ===
    {
      id: 'institute-mega-50k-75k',
      name: 'Mega Enterprise (50k–75k Students)',
      category: 'INSTITUTE',
      billing_period: 'ANNUAL',
      price_inr: 749999,
      original_price_inr: 899999,
      evaluation_allowance: 85000,
      student_capacity: 75000,
      unlimited_badge: 0,
      badge: 'Annual-Only Mega Tier',
      min_students: 50001,
      max_students: 75000,
      tier_code: 'MEGA_75K',
      is_custom: 0,
      benefits_json: JSON.stringify([
        '50,001 to 75,000 enrolled students',
        '85,000 evaluations/year pool',
        'Foundation, Intermediate, Final — All Subjects',
        'Dedicated cloud computing cluster',
        'Full institutional API & ERP integration',
        'Multi-center and pan-India branch isolation',
        'Custom institutional report templates',
        '24/7 Dedicated Technical Account Manager',
      ]),
      is_active: 1,
      sort_order: 11,
    },
    {
      id: 'institute-mega-75k-100k',
      name: 'Mega Enterprise (75k–100k Students)',
      category: 'INSTITUTE',
      billing_period: 'ANNUAL',
      price_inr: 999999,
      original_price_inr: 1199999,
      evaluation_allowance: 115000,
      student_capacity: 100000,
      unlimited_badge: 0,
      badge: 'Annual-Only Mega Tier',
      min_students: 75001,
      max_students: 100000,
      tier_code: 'MEGA_100K',
      is_custom: 0,
      benefits_json: JSON.stringify([
        '75,001 to 100,000 enrolled students',
        '115,000 evaluations/year pool',
        'Foundation, Intermediate, Final — All Subjects',
        'Custom fine-tuned evaluation rubric support',
        'Unlimited faculty/evaluator sub-accounts',
        'SSO (Single Sign-On) integration',
        'Institutional AIR prediction index',
        '24/7 Priority SLA response guarantee',
      ]),
      is_active: 1,
      sort_order: 12,
    },
    {
      id: 'institute-mega-100k-150k',
      name: 'Mega Enterprise (100k–150k Students)',
      category: 'INSTITUTE',
      billing_period: 'ANNUAL',
      price_inr: 1499999,
      original_price_inr: 1799999,
      evaluation_allowance: 175000,
      student_capacity: 150000,
      unlimited_badge: 0,
      badge: 'Annual-Only Mega Tier',
      min_students: 100001,
      max_students: 150000,
      tier_code: 'MEGA_150K',
      is_custom: 0,
      benefits_json: JSON.stringify([
        '100,001 to 150,000 enrolled students',
        '175,000 evaluations/year pool',
        'Foundation, Intermediate, Final — All Subjects',
        'Private institutional evaluation models',
        'Comprehensive multi-tier audit trail',
        'Automated batch progression workflows',
        'Executive dashboard for Board & Directors',
        'Enterprise SLA with 99.9% uptime commitment',
      ]),
      is_active: 1,
      sort_order: 13,
    },
    {
      id: 'institute-mega-150k-250k',
      name: 'Mega Enterprise (150k–250k Students)',
      category: 'INSTITUTE',
      billing_period: 'ANNUAL',
      price_inr: 2499999,
      original_price_inr: 2999999,
      evaluation_allowance: 300000,
      student_capacity: 250000,
      unlimited_badge: 0,
      badge: 'Annual-Only Mega Tier',
      min_students: 150001,
      max_students: 250000,
      tier_code: 'MEGA_250K',
      is_custom: 0,
      benefits_json: JSON.stringify([
        '150,001 to 250,000 enrolled students',
        '300,000 evaluations/year pool',
        'Foundation, Intermediate, Final — All Subjects',
        'Enterprise-scale distributed evaluation cluster',
        'Custom question bank & test authoring suite',
        'Dedicated senior engineering & pedagogical team',
        'Annual contract with custom payment schedules',
      ]),
      is_active: 1,
      sort_order: 14,
    },
    {
      id: 'institute-mega-custom',
      name: 'Custom Enterprise (250,000+ Students)',
      category: 'INSTITUTE',
      billing_period: 'ANNUAL',
      price_inr: 0,
      original_price_inr: 0,
      evaluation_allowance: 9999999,
      student_capacity: 500000,
      unlimited_badge: 1,
      badge: 'Custom Architecture',
      min_students: 250001,
      max_students: 1000000,
      tier_code: 'CUSTOM_ENTERPRISE',
      is_custom: 1,
      benefits_json: JSON.stringify([
        '250,000+ Students scale',
        'Tailored annual evaluation capacity',
        'Foundation, Intermediate, Final — All Subjects',
        'On-premises / Private cloud deployment option',
        'Custom bespoke AI models and grading criteria',
        'Full custom contract & tailored commercial terms',
        'Direct hotline to Engineering Leadership',
      ]),
      is_active: 1,
      sort_order: 15,
    },

    // === 4. STUDENT / CANDIDATE INDIVIDUAL TIERS ===
    {
      id: 'student-free-tier',
      name: 'Free Starter Trial',
      category: 'STUDENT',
      billing_period: 'MONTHLY',
      price_inr: 0,
      original_price_inr: 20,
      evaluation_allowance: 2,
      student_capacity: 1,
      unlimited_badge: 0,
      badge: 'Free with Signup',
      min_students: 1,
      max_students: 1,
      tier_code: 'STUDENT_FREE',
      is_custom: 0,
      benefits_json: JSON.stringify([
        '2 Free Full ICAI-standard answer sheet evaluations',
        'Step-by-step marking with question-by-question examiner remarks',
        'Working note validation & statutory section accuracy check',
        'Authentic evaluated copy PDF download',
        'Valid for Foundation, Inter & Final',
      ]),
      is_active: 1,
      sort_order: 16,
    },
    {
      id: 'student-pay-per-paper',
      name: 'Pay-Per-Paper (1 Evaluation)',
      category: 'STUDENT',
      billing_period: 'MONTHLY',
      price_inr: 10,
      original_price_inr: 25,
      evaluation_allowance: 1,
      student_capacity: 1,
      unlimited_badge: 0,
      badge: '₹10 / Paper',
      min_students: 1,
      max_students: 1,
      tier_code: 'STUDENT_1',
      is_custom: 0,
      benefits_json: JSON.stringify([
        '1 Full ICAI-standard answer sheet evaluation credit',
        'Deep step-by-step marking & working notes check',
        'Question-by-question examiner remarks & marks breakdown',
        'Official ICAI guideline answer matching & section validation',
        'Authentic evaluated checked copy PDF generation',
        'Credits valid for 3 months from purchase',
      ]),
      is_active: 1,
      sort_order: 17,
    },
    {
      id: 'student-5-pack',
      name: '5 Evaluation Credits Pack',
      category: 'STUDENT',
      billing_period: 'MONTHLY',
      price_inr: 50,
      original_price_inr: 100,
      evaluation_allowance: 5,
      student_capacity: 1,
      unlimited_badge: 0,
      badge: 'Basic Pack',
      min_students: 1,
      max_students: 1,
      tier_code: 'STUDENT_5',
      is_custom: 0,
      benefits_json: JSON.stringify([
        '5 Full ICAI-standard answer sheet evaluations',
        'Deep step-by-step marking & working notes check',
        'Question-by-question examiner remarks & marks breakdown',
        'Authentic evaluated checked copy PDF generation',
        'Credits valid for 3 months from purchase',
      ]),
      is_active: 1,
      sort_order: 18,
    },
    {
      id: 'student-10-pack',
      name: '10 Evaluation Credits Pack',
      category: 'STUDENT',
      billing_period: 'MONTHLY',
      price_inr: 100,
      original_price_inr: 200,
      evaluation_allowance: 10,
      student_capacity: 1,
      unlimited_badge: 0,
      badge: 'Most Popular',
      min_students: 1,
      max_students: 1,
      tier_code: 'STUDENT_10',
      is_custom: 0,
      benefits_json: JSON.stringify([
        '10 Full ICAI-standard answer sheet evaluations',
        'Deep step-by-step marking & working notes check',
        'Question-by-question examiner remarks & marks breakdown',
        'Authentic evaluated checked copy PDF generation',
        'Performance diagnostic & passing probability index',
        'Credits valid for 3 months from purchase',
      ]),
      is_active: 1,
      sort_order: 19,
    },
    {
      id: 'student-20-pack',
      name: '20 Evaluation Credits Pack',
      category: 'STUDENT',
      billing_period: 'MONTHLY',
      price_inr: 200,
      original_price_inr: 400,
      evaluation_allowance: 20,
      student_capacity: 1,
      unlimited_badge: 0,
      badge: 'Best Value',
      min_students: 1,
      max_students: 1,
      tier_code: 'STUDENT_20',
      is_custom: 0,
      benefits_json: JSON.stringify([
        '20 Full ICAI-standard answer sheet evaluations',
        'Deep step-by-step marking & working notes check',
        'Question-by-question examiner remarks & marks breakdown',
        'Authentic evaluated checked copy PDF generation',
        'Performance diagnostic & passing probability index',
        'Priority evaluation queue',
        'Credits valid for 3 months from purchase',
      ]),
      is_active: 1,
      sort_order: 20,
    },
  ];

  // Clean up any legacy erroneous plans like "Single Subject Pro" or "Both Groups Pro"
  try {
    db.prepare(`
      DELETE FROM pricing_plans 
      WHERE id IN ('single-subject-pro-monthly', 'both-groups-pro-monthly', 'all-levels-ultimate-monthly',
                   'single-subject-pro-annual', 'both-groups-pro-annual', 'all-levels-ultimate-annual',
                   'plan_inst_starter', 'plan_inst_growth', 'plan_inst_enterprise')
    `).run();
    db.prepare(`
      DELETE FROM institute_plans 
      WHERE id IN ('single-subject-pro-monthly', 'both-groups-pro-monthly', 'all-levels-ultimate-monthly',
                   'single-subject-pro-annual', 'both-groups-pro-annual', 'all-levels-ultimate-annual',
                   'plan_inst_starter', 'plan_inst_growth', 'plan_inst_enterprise')
    `).run();
  } catch (err) {
    console.warn('Legacy plan cleanup warning:', err);
  }

  for (const p of plans) {
    const existing = db.prepare('SELECT id FROM pricing_plans WHERE id = ?').get(p.id);
    if (!existing) {
      db.prepare(`
        INSERT INTO pricing_plans (
          id, name, category, billing_period, price_inr, original_price_inr, evaluation_allowance,
          student_capacity, unlimited_badge, badge, min_students, max_students, tier_code, is_custom,
          benefits_json, is_active, sort_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        p.id, p.name, p.category, p.billing_period, p.price_inr, p.original_price_inr, p.evaluation_allowance,
        p.student_capacity, p.unlimited_badge, p.badge, p.min_students, p.max_students, p.tier_code, p.is_custom,
        p.benefits_json, p.is_active, p.sort_order
      );
    } else {
      db.prepare(`
        UPDATE pricing_plans SET
          name = ?, category = ?, billing_period = ?, price_inr = ?, original_price_inr = ?,
          evaluation_allowance = ?, student_capacity = ?, unlimited_badge = ?,
          badge = ?, min_students = ?, max_students = ?, tier_code = ?, is_custom = ?,
          benefits_json = ?, is_active = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        p.name, p.category, p.billing_period, p.price_inr, p.original_price_inr, p.evaluation_allowance,
        p.student_capacity, p.unlimited_badge, p.badge, p.min_students, p.max_students, p.tier_code, p.is_custom,
        p.benefits_json, p.is_active, p.sort_order, p.id
      );
    }
  }
}

function seedModelConfigs() {
  // 1. Purge all invalid, non-approved, or legacy models
  db.prepare(`
    DELETE FROM model_configs
    WHERE id NOT IN ('gemini-3.8-flash', 'gemini-3.1-pro-preview', 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash')
  `).run();

  // 2. Synchronize active pricing_settings so old models are never chosen
  db.prepare(`
    UPDATE pricing_settings
    SET value = 'gemini-3.8-flash'
    WHERE key = 'EVAL_MODEL_PROVIDER' AND (value IN ('gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-1.5-pro', 'gemini-3.8-pro') OR value NOT IN ('gemini-3.8-flash', 'gemini-3.1-pro-preview', 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash'))
  `).run();

  db.prepare(`
    UPDATE pricing_settings
    SET value = 'gemini-3.6-flash'
    WHERE key = 'EVAL_FALLBACK_MODEL' AND (value IN ('gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-1.5-pro', 'gemini-3.8-pro') OR value NOT IN ('gemini-3.8-flash', 'gemini-3.1-pro-preview', 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash'))
  `).run();

  db.prepare(`
    UPDATE pricing_settings
    SET value = 'ZERO_FOR_ALL'
    WHERE key = 'EVAL_MCQ_NEGATIVE_MARKING'
  `).run();

  // Ensure is_primary is only on gemini-3.8-flash unless admin explicitly switched to another approved model
  const currentPrimary = db.prepare("SELECT id FROM model_configs WHERE is_primary = 1").all() as any[];
  if (currentPrimary.length !== 1 || !['gemini-3.8-flash', 'gemini-3.1-pro-preview', 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash'].includes(currentPrimary[0]?.id)) {
    db.prepare("UPDATE model_configs SET is_primary = CASE WHEN id = 'gemini-3.8-flash' THEN 1 ELSE 0 END").run();
  }

  const geminiConfigured = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.length > 5);
  const defaultStatus = geminiConfigured ? 'AVAILABLE' : 'NOT_CONFIGURED';

  // 3. Approved Gemini Models with Deterministic Priorities (1 to 5)
  const models = [
    {
      id: 'gemini-3.8-flash',
      provider: 'gemini',
      display_name: 'Google Gemini 3.8 Flash',
      role: 'Primary',
      is_primary: 1,
      fallback_order: 1,
      thinking_level: 'HIGH',
      temperature: 0.2,
      top_p: 0.95,
      max_tokens: 8192,
    },
    {
      id: 'gemini-3.1-pro-preview',
      provider: 'gemini',
      display_name: 'Google Gemini 3.1 Pro (Preview)',
      role: 'Deep Reasoning',
      is_primary: 0,
      fallback_order: 2,
      thinking_level: 'HIGH',
      temperature: 0.2,
      top_p: 0.95,
      max_tokens: 8192,
    },
    {
      id: 'gemini-3.7-flash',
      provider: 'gemini',
      display_name: 'Google Gemini 3.7 Flash',
      role: 'Fast Multimodal',
      is_primary: 0,
      fallback_order: 3,
      thinking_level: 'MEDIUM',
      temperature: 0.2,
      top_p: 0.95,
      max_tokens: 8192,
    },
    {
      id: 'gemini-3.6-flash',
      provider: 'gemini',
      display_name: 'Google Gemini 3.6 Flash',
      role: 'Fallback #1',
      is_primary: 0,
      fallback_order: 4,
      thinking_level: 'MEDIUM',
      temperature: 0.2,
      top_p: 0.95,
      max_tokens: 8192,
    },
    {
      id: 'gemini-3.5-flash',
      provider: 'gemini',
      display_name: 'Google Gemini 3.5 Flash',
      role: 'Fallback #2',
      is_primary: 0,
      fallback_order: 5,
      thinking_level: 'MEDIUM',
      temperature: 0.2,
      top_p: 0.95,
      max_tokens: 8192,
    },
  ];

  for (const m of models) {
    const existing = db.prepare('SELECT id FROM model_configs WHERE id = ?').get(m.id);
    if (!existing) {
      db.prepare(`
        INSERT INTO model_configs (id, provider, display_name, role, is_primary, fallback_order, thinking_level, temperature, top_p, max_tokens, is_enabled, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
      `).run(m.id, m.provider, m.display_name, m.role, m.is_primary, m.fallback_order, m.thinking_level, m.temperature, m.top_p, m.max_tokens, defaultStatus);
    } else {
      db.prepare(`
        UPDATE model_configs SET
          provider = ?, display_name = ?, role = ?, fallback_order = ?, thinking_level = ?, max_tokens = ?,
          status = CASE WHEN status = 'RETIRED' THEN ? ELSE status END
        WHERE id = ?
      `).run(m.provider, m.display_name, m.role, m.fallback_order, m.thinking_level, m.max_tokens, defaultStatus, m.id);
    }
  }
}

function seedReferralCampaigns() {
  const existing = db.prepare('SELECT code FROM referral_campaigns WHERE code = ?').get('AI30');
  if (!existing) {
    db.prepare(`
      INSERT INTO referral_campaigns (
        code, campaign_name, description, benefit_type, benefit_duration_days, 
        max_redemptions, max_evaluations, is_active, status, user_type, terms_notes
      ) VALUES (
        'AI30', 'AI30 Special Promo - 1 Month Free Access', 
        'Special promotional launch offer with 15 free evaluations for 30 days.', 
        '1_MONTH_FREE_ACCESS', 30, 20, 15, 1, 'ACTIVE', 'ALL',
        'Valid for the first 20 eligible student registrations.'
      )
    `).run();
  } else {
    // Ensure baseline fields are set properly while preserving custom configurations
    db.prepare(`
      UPDATE referral_campaigns
      SET status = COALESCE(NULLIF(status, ''), 'ACTIVE'),
          description = COALESCE(NULLIF(description, ''), 'Special promotional launch offer with 15 free evaluations for 30 days.')
      WHERE code = 'AI30'
    `).run();
  }
}

function seedEvaluationMaterials() {
  const materials = [
    // CA Inter Advanced Accounting MTP
    {
      id: 'mat_inter_adv_acc_mtp_1',
      level: 'INTERMEDIATE',
      material_type: 'MTP',
      model_group: 'GROUP_1',
      subject_key: 'inter_advanced_accounting',
      subject_name: 'Advanced Accounting',
      attempt: 'May 2026',
      question_paper_title: 'ICAI Mock Test Paper Series I - Advanced Accounting',
      question_paper_text: `PAPER 1: ADVANCED ACCOUNTING (100 MARKS)
Division A - Multiple Choice Questions (30 Marks - Case Scenarios 1 & 2)
Division B - Descriptive Questions (70 Marks)
Q1. (Compulsory) (14 Marks):
(a) H Ltd. acquired 80% equity shares of S Ltd. on 1st April 2024 for ₹12,00,000. Balance sheet of S Ltd. as on that date showed Equity Capital ₹8,00,000 and General Reserve ₹3,00,000. Calculate Goodwill/Capital Reserve as per AS 21.
(b) Explain accounting treatment for impairment of assets as per AS 28 when Value in Use is ₹45,00,000 and Net Selling Price is ₹42,00,000 with carrying amount ₹50,00,000.
Q2. (14 Marks):
Prepare Cash Flow Statement of Apex Ltd. for the year ended 31st March 2025 as per AS 3 using Indirect Method.
Q3. (14 Marks):
Partnership Dissolution - Garner vs Murray rule application with insolvent partner deficiency calculation.
Q4. (14 Marks):
Branch Accounting - Debtors System vs Stock and Debtors Method with reconciliation of goods in transit.`,
      suggested_answers_text: `SUGGESTED ANSWERS & MARKING SCHEME - ADVANCED ACCOUNTING:
Q1(a) (7 Marks):
- Calculation of Net Identifiable Assets on Acquisition: Equity (₹8L) + General Reserve (₹3L) = ₹11,00,000. [2 Marks]
- Parent Share: 80% of ₹11,00,000 = ₹8,80,000. [2 Marks]
- Cost of Investment: ₹12,00,000. Goodwill on consolidation = ₹12,00,000 - ₹8,80,000 = ₹3,20,000. [3 Marks]
Q1(b) (7 Marks):
- Definition of Recoverable Amount: Higher of Net Selling Price (₹42L) and Value in Use (₹45L) = ₹45,00,000. [3 Marks]
- Impairment Loss = Carrying Amount (₹50L) - Recoverable Amount (₹45L) = ₹5,00,000 recognized in P&L. [4 Marks]
Q2 (14 Marks):
- Operating Activities: Net profit before tax adjustment + Non-cash items (Depreciation, Profit on Sale) + Working capital changes = Correct Cash from Operations. [6 Marks]
- Investing Activities: Purchase of Fixed Assets, Sale Proceeds. [4 Marks]
- Financing Activities: Issue of shares, Dividend paid, Redemption of Debentures. [4 Marks]`,
      marking_scheme_text: 'Strict step marking. Full marks for correct principles even if final arithmetic slip occurred in working notes; penalize missed AS references by 1 mark.'
    },
    // CA Inter Taxation (Income Tax & GST)
    {
      id: 'mat_inter_taxation_mtp_1',
      level: 'INTERMEDIATE',
      material_type: 'MTP',
      model_group: 'GROUP_1',
      subject_key: 'inter_taxation',
      subject_name: 'Taxation (Income Tax & GST)',
      attempt: 'May 2026',
      question_paper_title: 'ICAI Mock Test Paper Series I - Taxation',
      question_paper_text: `PAPER 3: TAXATION (100 MARKS)
Section A: Income-tax Law (50 Marks)
Q1. (15 Marks) Total Income computation of Mr. Raman (Resident, aged 47 years) under regular scheme and default tax regime u/s 115BAC.
Q2. (10 Marks) Capital Gains u/s 54 and Section 50C full value of consideration with stamp duty value exceeding 110%.
Section B: Goods and Services Tax (50 Marks)
Q3. (15 Marks) Compute Net GST payable from Electronic Cash Ledger after ITC set-off hierarchy as per Rule 88A.`,
      suggested_answers_text: `SUGGESTED ANSWERS - TAXATION:
Q1 (15 Marks):
- Salary income: Basic + DA + HRA exemption u/s 10(13A) least of 3 limits. Standard deduction ₹50,000 u/s 16(ia). [4 Marks]
- House property: Municipal value, Fair rent, NAV, deduction u/s 24(a) @ 30%, interest on housing loan u/s 24(b) max ₹2,00,000. [4 Marks]
- PGBP: Depreciation as per Income Tax Rules 1962. Section 40(a)(ia) 30% disallowance for non-TDS deduction. [4 Marks]
- Tax computation comparison between 115BAC and normal provisions. [3 Marks]
Q3 (GST) (15 Marks):
- Rule 88A order of utilization: IGST credit first utilized towards IGST, then towards CGST and SGST in any order/proportion. [5 Marks]
- CGST credit cannot be utilized against SGST liability and vice versa. [5 Marks]
- Calculation of net cash discharge. [5 Marks]`,
      marking_scheme_text: 'Award step marks for correct sections (Sec 10(13A), 54, 50C, 115BAC, Rule 88A). In MCQs, strictly NO negative marking.'
    },
    // CA Inter Corporate and Other Laws
    {
      id: 'mat_inter_law_mtp_1',
      level: 'INTERMEDIATE',
      material_type: 'MTP',
      model_group: 'GROUP_1',
      subject_key: 'inter_corporate_law',
      subject_name: 'Corporate and Other Laws',
      attempt: 'May 2026',
      question_paper_title: 'ICAI Model Test Paper - Corporate and Other Laws',
      question_paper_text: `PAPER 2: CORPORATE AND OTHER LAWS (100 MARKS)
Q1. (Compulsory) (14 Marks):
(a) Section 135: Corporate Social Responsibility (CSR) applicability criteria (Net worth ₹500 Cr, Turnover ₹1000 Cr, or Net Profit ₹5 Cr). Treatment of unspent CSR amount related to ongoing project vs other projects.
(b) Section 68: Buy-back of shares conditions, debt-equity ratio test (2:1), and maximum limit of 25% of paid-up capital & free reserves.
Q2. (14 Marks):
FEMA 1999: Current account transaction vs Capital account transaction analysis and permissible remittances under Liberalised Remittance Scheme (LRS).`,
      suggested_answers_text: `SUGGESTED ANSWERS:
Q1(a) (7 Marks):
- Quoting Section 135(1) threshold limits accurately: Net worth >= ₹500 Cr, Turnover >= ₹1000 Cr, Net profit >= ₹5 Cr during immediately preceding financial year. [3 Marks]
- Section 135(6) Ongoing project: Transfer unspent amount within 30 days of end of FY to Unspent CSR Account in scheduled bank, spend within 3 FYs. If still unspent, transfer to Schedule VII fund within 30 days. [4 Marks]
Q1(b) (7 Marks):
- Section 68(2) conditions: Special resolution or Board resolution up to 10%. [2 Marks]
- Debt-Equity ratio after buy-back must not exceed 2:1. [2 Marks]
- Extinguishment of physical shares within 7 days. [3 Marks]`,
      marking_scheme_text: 'Reward accurate statutory provisions and logical conclusion. Do not require word-for-word memorization.'
    },
    // CA Final Financial Reporting
    {
      id: 'mat_final_fr_mtp_1',
      level: 'FINAL',
      material_type: 'MTP',
      model_group: 'GROUP_1',
      subject_key: 'final_fr',
      subject_name: 'Financial Reporting',
      attempt: 'May 2026',
      question_paper_title: 'ICAI Mock Test Paper - Financial Reporting',
      question_paper_text: `PAPER 1: FINANCIAL REPORTING (100 MARKS)
Q1. (Compulsory) (20 Marks):
Consolidated Financial Statements under Ind AS 103 (Business Combinations) and Ind AS 110:
P Ltd. acquires 75% voting rights in Q Ltd. Fair value of net identifiable assets, Non-Controlling Interest (NCI) valuation under Proportionate Share method vs Full Goodwill method, Contingent consideration fair value adjustment.
Q2. (16 Marks):
Ind AS 115 (Revenue from Contracts with Customers): 5-step model application, variable consideration, transaction price allocation to multiple performance obligations, and contract modifications.`,
      suggested_answers_text: `SUGGESTED ANSWERS:
Q1 (20 Marks):
- Purchase consideration calculation including fair value of contingent consideration at acquisition date. [4 Marks]
- Fair value of net identifiable assets of acquiree. [4 Marks]
- NCI calculation under both methods. [4 Marks]
- Goodwill / Gain on Bargain Purchase calculation with journal entries. [8 Marks]
Q2 (16 Marks):
- Step 1 to Step 5 structured identification. [5 Marks]
- Standalone selling prices ratio allocation. [6 Marks]
- Revenue recognition over time vs at a point in time with disclosure. [5 Marks]`,
      marking_scheme_text: 'Zero negative marking in MCQs. Step marks for each Ind AS standard provision and working note table.'
    },
    // CA Foundation Accounting
    {
      id: 'mat_foundation_acc_mtp_1',
      level: 'FOUNDATION',
      material_type: 'MODEL',
      model_group: 'OTHER',
      subject_key: 'foundation_accounting',
      subject_name: 'Accounting',
      attempt: 'June 2026',
      question_paper_title: 'ICAI Model Test Paper - Foundation Accounting',
      question_paper_text: `PAPER 1: ACCOUNTING (100 MARKS)
Q1. (Compulsory) (20 Marks):
(a) State with reasons whether the following statements are True or False (6 x 2 = 12 Marks).
(b) Bank Reconciliation Statement starting with overdraft as per Cash Book (8 Marks).
Q2. (20 Marks):
Preparation of Trading, Profit & Loss Account and Balance Sheet of Mr. Anant as on 31st March 2026 with adjustments for closing stock, prepaid insurance, bad debts reserve, and depreciation.`,
      suggested_answers_text: `SUGGESTED ANSWERS:
Q1(a) (12 Marks):
Each True/False statement with valid legal reason earns 2 marks. No marks awarded for True/False without supporting reason.
Q1(b) (8 Marks):
Bank Reconciliation Statement: Overdraft as per cash book ₹84,500. Correct add/less treatment of cheques issued but not presented, direct deposits, bank charges, and dishonored bills.
Q2 (20 Marks):
Trading Account Gross Profit: ₹1,85,400 [6 Marks]. Net Profit: ₹1,12,600 [7 Marks]. Balance Sheet Total: ₹4,50,000 [7 Marks]. Step marks awarded for individual ledger adjustments.`,
      marking_scheme_text: 'Strict verification of True/False reasoning. Credit partial ledger workings.'
    }
  ];

  for (const m of materials) {
    const existing = db.prepare('SELECT id FROM evaluation_materials WHERE id = ?').get(m.id);
    if (!existing) {
      db.prepare(`
        INSERT INTO evaluation_materials (
          id, level, material_type, model_group, subject_key, subject_name,
          paper, attempt, syllabus_version, question_paper_title, question_paper_text,
          suggested_answers_text, marking_scheme_text, reference_guidance_text,
          effective_date, version, status, uploaded_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'New Scheme 2024', ?, ?, ?, ?, ?, '2024-05-01', '1.0', 'ACTIVE', 'SYSTEM_SEED')
      `).run(
        m.id, m.level, m.material_type, m.model_group, m.subject_key, m.subject_name,
        (m as any).paper || 'Paper 1', m.attempt, m.question_paper_title, m.question_paper_text,
        m.suggested_answers_text, m.marking_scheme_text,
        (m as any).reference_guidance_text || 'Standard ICAI examination-style marking rubric'
      );
    } else {
      db.prepare(`
        UPDATE evaluation_materials 
        SET status = 'ACTIVE',
            paper = COALESCE(paper, 'Paper 1'),
            syllabus_version = COALESCE(syllabus_version, 'New Scheme 2024')
        WHERE id = ?
      `).run(m.id);
    }
  }
}

function seedSampleInstitute() {
  const instId = 'inst_apex_academy_01';
  const existing = db.prepare('SELECT id FROM institutes WHERE id = ?').get(instId);
  if (!existing) {
    db.prepare(`
      INSERT INTO institutes (
        id, name, code, logo_url, email, phone, address, website,
        contact_person, status, subscription_plan, subscription_expires_at, max_students
      ) VALUES (
        ?, 'Apex CA Academy', 'APEX-CA-2026', '', 'director@apexca.edu', '+919811223344',
        'Connaught Place, New Delhi', 'https://apexca.edu', 'CA Rajesh Khurana, FCA',
        'ACTIVE', 'INSTITUTIONAL_PRO', '2027-12-31T23:59:59.000Z', 500
      )
    `).run(instId);

    // Create default batches for this institute
    const batch1 = 'batch_inter_nov26';
    db.prepare(`
      INSERT INTO batches (id, institute_id, name, course_level, description)
      VALUES (?, ?, 'CA Inter Regular Batch - Nov 2026', 'INTERMEDIATE', 'Comprehensive classroom & test series batch')
    `).run(batch1, instId);

    const batch2 = 'batch_final_fasttrack';
    db.prepare(`
      INSERT INTO batches (id, institute_id, name, course_level, description)
      VALUES (?, ?, 'CA Final Fast Track & Mock Series', 'FINAL', 'Intensive practical problem solving and MTP evaluation')
    `).run(batch2, instId);

    // Create an assignment
    const assign1 = 'asgn_inter_acc_test1';
    db.prepare(`
      INSERT INTO institute_assignments (
        id, institute_id, batch_id, title, subject_key, subject_name,
        maximum_marks, instructions, time_limit_minutes, deadline
      ) VALUES (
        ?, ?, ?, 'MTP Series 1: Advanced Accounting Test', 'inter_advanced_accounting', 'Advanced Accounting',
        100, 'Attempt all questions in handwritten format on standard ICAI rule sheets. Show all working notes clearly.',
        180, '2026-10-15T23:59:59.000Z'
      )
    `).run(assign1, instId, batch1);

    // Create Institute Admin User
    const instAdminEmail = 'institute@apexca.edu';
    const pwdHash = hashPassword('ApexCA@2026');
    const instAdminId = 'usr_inst_apex_admin';
    const userExists = db.prepare('SELECT id FROM users WHERE email = ?').get(instAdminEmail);
    if (!userExists) {
      db.prepare(`
        INSERT INTO users (id, email, password_hash, full_name, phone, role, status)
        VALUES (?, ?, ?, 'Director Khurana', '+919811223344', 'INSTITUTE_ADMIN', 'ACTIVE')
      `).run(instAdminId, instAdminEmail, pwdHash);
    }

    // Create Demo Student User
    const studentEmail = 'student@caexamchecker.ai';
    const studentExists = db.prepare('SELECT id FROM users WHERE email = ?').get(studentEmail);
    if (!studentExists) {
      const sId = 'usr_student_demo_001';
      const sHash = hashPassword('Student@CA2026!');
      db.prepare(`
        INSERT INTO users (id, email, password_hash, full_name, phone, role, status)
        VALUES (?, ?, ?, 'Rahul Sharma', '+919876543211', 'STUDENT', 'ACTIVE')
      `).run(sId, studentEmail, sHash);

      db.prepare(`
        INSERT INTO student_profiles (user_id, icai_registration_number, ca_level, free_evaluations_used, purchased_credits, institute_id, batch_id)
        VALUES (?, 'CRO0789456', 'INTERMEDIATE', 0, 5, 'inst_apex_academy_01', 'batch_inter_nov26')
      `).run(sId);

      db.prepare(`
        INSERT OR IGNORE INTO institute_memberships (id, institute_id, student_id, batch_id, status)
        VALUES ('mem_demo_01', 'inst_apex_academy_01', ?, 'batch_inter_nov26', 'ACTIVE')
      `).run(sId);
    }

    // Seed Active Account for at9767676@gmail.com
    const userEmail = 'at9767676@gmail.com';
    const activeUserExists = db.prepare('SELECT id FROM users WHERE lower(email) = ?').get(userEmail.toLowerCase());
    if (!activeUserExists) {
      const uId = 'usr_user_at9767';
      const uHash = hashPassword('Student@CA2026!');
      db.prepare(`
        INSERT INTO users (id, email, password_hash, full_name, phone, role, status)
        VALUES (?, ?, ?, 'Verified CA Candidate', '+919876543210', 'STUDENT', 'ACTIVE')
      `).run(uId, userEmail.toLowerCase(), uHash);

      db.prepare(`
        INSERT OR IGNORE INTO student_profiles (user_id, icai_registration_number, ca_level, free_evaluations_used, purchased_credits)
        VALUES (?, 'WRO0987654', 'INTERMEDIATE', 0, 10)
      `).run(uId);
    }
  }
}
