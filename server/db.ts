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
      attempt TEXT,
      question_paper_title TEXT NOT NULL,
      question_paper_text TEXT,
      suggested_answers_text TEXT,
      marking_scheme_text TEXT,
      uploaded_by TEXT DEFAULT 'ADMIN',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
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
      attempt TEXT,
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
  `);

  seedInitialData();
}

function seedInitialData() {
  // 1. Seed Super Admin & Support Admin with secure server-side ADMIN_PASSWORD
  const adminPassword = process.env.ADMIN_PASSWORD || 'BgMi@2006';
  const superAdminHash = hashPassword(adminPassword);
  const supportAdminHash = hashPassword('Admin@CA2026!');

  const admins = [
    { id: 'usr_super_admin_001', email: 'admin@caexamchecker.ai', name: 'Super Administrator', role: 'SUPER_ADMIN', hash: superAdminHash },
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
      // Keep super admin password hash synchronized with server ADMIN_PASSWORD
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

  // 3. Pricing Configuration (10 evaluation credits = ₹100, i.e. ₹10 per credit)
  const defaultPricing = [
    { key: 'PRICE_PER_CREDIT_INR', value: '10', description: 'Price in INR for single evaluation credit' },
    { key: 'FREE_TIER_EVALUATIONS', value: '2', description: 'Number of free evaluations for normal individual students' },
    { key: 'DEFAULT_INSTITUTE_QUOTA', value: '500', description: 'Default student allocation per institute' },
    { key: 'SUPPORT_EMAIL', value: 'caexamchecker.support@gmail.com', description: 'Official support email' },
    { key: 'INSTAGRAM_URL', value: 'https://insta.openinapp.co/utw2r', description: 'Official Instagram support link' },
  ];

  for (const p of defaultPricing) {
    const existing = db.prepare('SELECT key FROM pricing_settings WHERE key = ?').get(p.key);
    if (!existing) {
      db.prepare('INSERT INTO pricing_settings (key, value, description) VALUES (?, ?, ?)').run(p.key, p.value, p.description);
    }
  }

  // 4. Seed Official Reference Materials for CA Foundation, Inter, Final
  seedEvaluationMaterials();

  // 5. Seed a Model Institute so institutional sponsorship and batch management can be verified
  seedSampleInstitute();
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
          attempt, question_paper_title, question_paper_text,
          suggested_answers_text, marking_scheme_text, uploaded_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SYSTEM_SEED')
      `).run(
        m.id, m.level, m.material_type, m.model_group, m.subject_key, m.subject_name,
        m.attempt, m.question_paper_title, m.question_paper_text,
        m.suggested_answers_text, m.marking_scheme_text
      );
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
  }
}
