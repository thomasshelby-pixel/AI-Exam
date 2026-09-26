import crypto from 'node:crypto';
import { db, hashPassword } from '../db.js';
import {
  McqQuestion,
  McqCourse,
  McqQuestionType,
  McqDifficulty,
  McqSource,
  McqStatus,
  McqSession,
  McqSessionType,
  McqStudentProgress,
  McqAdminStats,
} from '../../src/types/index.js';

// ==========================================
// 1. INITIALIZE DATABASE TABLES & INDICES
// ==========================================
export function initMcqTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS mcq_cases (
      case_id TEXT PRIMARY KEY,
      case_title TEXT NOT NULL,
      case_scenario TEXT NOT NULL,
      case_difficulty TEXT NOT NULL DEFAULT 'moderate',
      course TEXT NOT NULL,
      subject TEXT NOT NULL,
      chapter TEXT NOT NULL,
      topic TEXT,
      source TEXT DEFAULT 'ICAI Module',
      attempt TEXT,
      applicable_from TEXT,
      applicable_till TEXT,
      amendment_version TEXT,
      generation_method TEXT DEFAULT 'MANUAL',
      status TEXT NOT NULL DEFAULT 'published',
      created_by TEXT DEFAULT 'MCQ_ADMIN',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_mcq_cases_filter ON mcq_cases(course, subject, chapter, status);

    CREATE TABLE IF NOT EXISTS mcq_questions (
      id TEXT PRIMARY KEY,
      course TEXT NOT NULL,
      subject TEXT NOT NULL,
      chapter TEXT NOT NULL,
      topic TEXT,
      question_type TEXT NOT NULL DEFAULT 'normal',
      case_id TEXT,
      case_sequence INTEGER,
      case_study_scenario TEXT,
      difficulty TEXT NOT NULL DEFAULT 'moderate',
      source TEXT NOT NULL DEFAULT 'ICAI Module',
      attempt TEXT,
      applicable_from TEXT,
      applicable_till TEXT,
      amendment_version TEXT,
      generation_method TEXT DEFAULT 'MANUAL',
      question_text TEXT NOT NULL,
      option_a TEXT NOT NULL,
      option_b TEXT NOT NULL,
      option_c TEXT NOT NULL,
      option_d TEXT NOT NULL,
      correct_answer TEXT NOT NULL,
      explanation TEXT NOT NULL,
      reference TEXT,
      status TEXT NOT NULL DEFAULT 'published',
      source_material_id TEXT,
      created_by TEXT DEFAULT 'MCQ_ADMIN',
      reviewed_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS mcq_import_batches (
      id TEXT PRIMARY KEY,
      batch_number TEXT,
      course TEXT NOT NULL,
      subject TEXT,
      material_type TEXT DEFAULT 'MIXED',
      difficulty TEXT DEFAULT 'mixed',
      source TEXT DEFAULT 'ICAI Module',
      attempt TEXT,
      source_material_id TEXT,
      generation_method TEXT DEFAULT 'IMPORTED',
      uploaded_by TEXT DEFAULT 'MCQ_ADMIN',
      status TEXT DEFAULT 'draft',
      row_count INTEGER DEFAULT 0,
      valid_count INTEGER DEFAULT 0,
      invalid_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_mcq_filter ON mcq_questions(course, subject, chapter, difficulty, status);
    CREATE INDEX IF NOT EXISTS idx_mcq_status ON mcq_questions(status);

    CREATE TABLE IF NOT EXISTS mcq_sessions (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      session_type TEXT NOT NULL DEFAULT 'practice',
      course TEXT NOT NULL,
      subject TEXT NOT NULL,
      chapter TEXT,
      topic TEXT,
      difficulty TEXT,
      total_questions INTEGER NOT NULL DEFAULT 0,
      attempted_questions INTEGER NOT NULL DEFAULT 0,
      correct_count INTEGER NOT NULL DEFAULT 0,
      incorrect_count INTEGER NOT NULL DEFAULT 0,
      skipped_count INTEGER NOT NULL DEFAULT 0,
      score REAL NOT NULL DEFAULT 0,
      accuracy_percentage REAL NOT NULL DEFAULT 0,
      time_spent_seconds INTEGER NOT NULL DEFAULT 0,
      duration_seconds INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'in_progress',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT,
      FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_mcq_sessions_student ON mcq_sessions(student_id, created_at);

    CREATE TABLE IF NOT EXISTS mcq_user_responses (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      question_id TEXT NOT NULL,
      selected_option TEXT,
      is_correct INTEGER DEFAULT 0,
      is_marked_for_review INTEGER DEFAULT 0,
      time_taken_seconds INTEGER DEFAULT 0,
      eliminated_options TEXT,
      answered_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES mcq_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (question_id) REFERENCES mcq_questions(id) ON DELETE CASCADE,
      UNIQUE(session_id, question_id)
    );

    CREATE INDEX IF NOT EXISTS idx_mcq_responses_session ON mcq_user_responses(session_id);
    CREATE INDEX IF NOT EXISTS idx_mcq_responses_student ON mcq_user_responses(student_id);

    CREATE TABLE IF NOT EXISTS mcq_bookmarks (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      question_id TEXT NOT NULL,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (question_id) REFERENCES mcq_questions(id) ON DELETE CASCADE,
      UNIQUE(student_id, question_id)
    );

    CREATE INDEX IF NOT EXISTS idx_mcq_bookmarks_student ON mcq_bookmarks(student_id);

    CREATE TABLE IF NOT EXISTS mcq_wrong_vault (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      question_id TEXT NOT NULL,
      last_wrong_option TEXT,
      wrong_count INTEGER NOT NULL DEFAULT 1,
      resolved INTEGER NOT NULL DEFAULT 0,
      last_attempted_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (question_id) REFERENCES mcq_questions(id) ON DELETE CASCADE,
      UNIQUE(student_id, question_id)
    );

    CREATE INDEX IF NOT EXISTS idx_mcq_wrong_student ON mcq_wrong_vault(student_id, resolved);
  `);

  // Ensure enhanced tracking columns for question bank duplicates / case bundles / source referencing
  try {
    const qCols = db.prepare('PRAGMA table_info(mcq_questions)').all() as any[];
    if (!qCols.some((c) => c.name === 'case_id')) {
      db.prepare('ALTER TABLE mcq_questions ADD COLUMN case_id TEXT').run();
    }
    if (!qCols.some((c) => c.name === 'case_sequence')) {
      db.prepare('ALTER TABLE mcq_questions ADD COLUMN case_sequence INTEGER').run();
    }
    if (!qCols.some((c) => c.name === 'source_material_id')) {
      db.prepare('ALTER TABLE mcq_questions ADD COLUMN source_material_id TEXT').run();
    }
    if (!qCols.some((c) => c.name === 'usage_count')) {
      db.prepare('ALTER TABLE mcq_questions ADD COLUMN usage_count INTEGER DEFAULT 1').run();
    }
    if (!qCols.some((c) => c.name === 'generation_method')) {
      db.prepare("ALTER TABLE mcq_questions ADD COLUMN generation_method TEXT DEFAULT 'MANUAL'").run();
    }
    const cCols = db.prepare('PRAGMA table_info(mcq_cases)').all() as any[];
    if (!cCols.some((c) => c.name === 'source_material_id')) {
      db.prepare('ALTER TABLE mcq_cases ADD COLUMN source_material_id TEXT').run();
    }
    if (!cCols.some((c) => c.name === 'generation_method')) {
      db.prepare("ALTER TABLE mcq_cases ADD COLUMN generation_method TEXT DEFAULT 'MANUAL'").run();
    }
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_mcq_case_id ON mcq_questions(case_id);
      CREATE INDEX IF NOT EXISTS idx_mcq_case_seq ON mcq_questions(case_id, case_sequence);
    `);
  } catch (colErr) {
    console.warn('[McqService] Column check error:', colErr);
  }
}

// ==========================================
// 2. SEED MCQ ADMIN & CURATED CA QUESTIONS
// ==========================================
export function seedMcqAdminAndQuestions() {
  // A. Seed initial MCQ Admin account: priyatca15@gmail.com
  const mcqAdminEmail = 'priyatca15@gmail.com';
  const defaultPassword = process.env.MCQ_ADMIN_PASSWORD || 'Priya@Arena2026!';
  const hashedPassword = hashPassword(defaultPassword);
  const adminId = 'usr_mcq_admin_priyatca15';

  const existing = db.prepare('SELECT id, email, role, mfa_enabled FROM users WHERE lower(email) = ? OR id = ?').get(mcqAdminEmail.toLowerCase(), adminId) as any;
  if (!existing) {
    db.prepare(`
      INSERT INTO users (id, email, password_hash, full_name, phone, role, status, account_classification, mfa_enabled)
      VALUES (?, ?, ?, 'Priya MCQ Administrator', '+919876543211', 'MCQ_ADMIN', 'ACTIVE', 'NORMAL', 1)
    `).run(adminId, mcqAdminEmail.toLowerCase(), hashedPassword);

    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details)
      VALUES (?, ?, 'INITIALIZE_MCQ_ADMIN', 'USER', ?, 'Created primary MCQ Admin account for priyatca15@gmail.com')
    `).run(`log_init_mcq_admin_${Date.now()}`, adminId, adminId);
  } else {
    db.prepare(`
      UPDATE users
      SET email = ?,
          password_hash = ?,
          full_name = 'Priya MCQ Administrator',
          role = 'MCQ_ADMIN',
          mfa_enabled = 1,
          status = 'ACTIVE',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(mcqAdminEmail.toLowerCase(), hashedPassword, existing.id);
  }

  // B. Seed comprehensive, verified CA MCQs
  const seedFlag = db.prepare("SELECT value FROM pricing_settings WHERE key = 'MCQ_QUESTIONS_INITIAL_SEED_DONE'").get() as { value?: string } | undefined;
  if (seedFlag?.value === 'true') {
    return; // Already initialized; never re-seed or resurrect intentionally deleted questions on restart!
  }

  const count = (db.prepare('SELECT count(*) as total FROM mcq_questions').get() as any)?.total || 0;
  if (count >= 15) {
    try {
      db.prepare("INSERT OR REPLACE INTO pricing_settings (key, value, description) VALUES ('MCQ_QUESTIONS_INITIAL_SEED_DONE', 'true', 'Prevents re-seeding mcq questions on restart')").run();
    } catch {}
    return; // Already populated
  }

  const sampleQuestions: Array<{
    id: string;
    course: McqCourse;
    subject: string;
    chapter: string;
    topic: string;
    question_type: McqQuestionType;
    case_study_scenario?: string;
    difficulty: McqDifficulty;
    source: McqSource;
    attempt: string;
    applicable_from: string;
    applicable_till: string;
    amendment_version: string;
    question_text: string;
    option_a: string;
    option_b: string;
    option_c: string;
    option_d: string;
    correct_answer: 'A' | 'B' | 'C' | 'D';
    explanation: string;
    reference: string;
  }> = [
    // ----------------------------------------------------
    // CA INTERMEDIATE - CORPORATE AND OTHER LAWS
    // ----------------------------------------------------
    {
      id: 'mcq_inter_law_001',
      course: 'CA_INTERMEDIATE',
      subject: 'Corporate and Other Laws',
      chapter: 'Management and Administration',
      topic: 'Annual General Meeting & Quorum',
      question_type: 'normal',
      difficulty: 'moderate',
      source: 'ICAI Module',
      attempt: 'May 2025',
      applicable_from: '2024-05-01',
      applicable_till: '2026-11-30',
      amendment_version: 'New Scheme 2024 (Sec 103 Companies Act 2013)',
      question_text: 'Zenith Synthetics Ltd., a public company, has 4,200 members as on the date of its Annual General Meeting (AGM). According to Section 103 of the Companies Act, 2013, what is the statutory quorum required for the valid constitution of this general meeting, unless the articles provide for a larger number?',
      option_a: '5 members personally present',
      option_b: '15 members personally present',
      option_c: '30 members personally present',
      option_d: '15 members present either in person or by proxy',
      correct_answer: 'B',
      explanation: 'Under Section 103(1)(a) of the Companies Act, 2013, in the case of a public company, the quorum is: (i) 5 members personally present if number of members as on the date of meeting is not more than 1,000; (ii) 15 members personally present if number of members is more than 1,000 but up to 5,000; (iii) 30 members personally present if number of members exceeds 5,000. Here, Zenith Synthetics Ltd. has 4,200 members (which falls between 1,001 and 5,000), hence exactly 15 members personally present constitute valid quorum. Proxies are excluded from counting quorum under Section 103.',
      reference: 'Companies Act, 2013, Section 103(1)(a)(ii) & ICAI Study Material Paper 2 Ch 7',
    },
    {
      id: 'mcq_inter_law_002',
      course: 'CA_INTERMEDIATE',
      subject: 'Corporate and Other Laws',
      chapter: 'Declaration and Payment of Dividend',
      topic: 'Unpaid Dividend Account Transfer & IEPF',
      question_type: 'normal',
      difficulty: 'hard',
      source: 'PYQ',
      attempt: 'Nov 2024',
      applicable_from: '2024-05-01',
      applicable_till: '2026-11-30',
      amendment_version: 'Sec 124 Companies Act 2013',
      question_text: 'A company declared dividend on 1st September 2024. A portion of the dividend remained unpaid or unclaimed as of 30th September 2024. By what date must the company transfer the unpaid dividend to the special "Unpaid Dividend Account" opened in a scheduled bank, and within how many days thereafter must it upload a statement of such unpaid dividend on its website?',
      option_a: 'Transfer within 7 days of expiry of 30 days (by 7th October 2024); upload statement within 90 days of transfer',
      option_b: 'Transfer within 30 days of expiry; upload statement within 30 days of transfer',
      option_c: 'Transfer immediately to IEPF within 7 days; upload statement within 60 days',
      option_d: 'Transfer within 7 days of declaration; upload statement within 30 days',
      correct_answer: 'A',
      explanation: 'Under Section 124(1) of the Companies Act, 2013, where a dividend has been declared by a company but has not been paid or claimed within 30 days from the date of declaration (i.e. by 1st Oct), the company shall, within 7 days from the date of expiry of the said 30 days (i.e. by 7th Oct 2024), transfer the total unpaid/unclaimed dividend amount to a special account opened by the company in that behalf in any scheduled bank to be called "Unpaid Dividend Account". Furthermore, under Section 124(2), the company shall, within a period of 90 days of making any transfer to the Unpaid Dividend Account, prepare a statement containing the names, last known addresses and the unpaid dividend to be paid to each person and place it on the website of the company.',
      reference: 'Companies Act, 2013, Section 124(1) & 124(2)',
    },
    {
      id: 'mcq_inter_law_003_case',
      course: 'CA_INTERMEDIATE',
      subject: 'Corporate and Other Laws',
      chapter: 'Prospectus and Allotment of Securities',
      topic: 'Shelf Prospectus & Information Memorandum',
      question_type: 'case_based',
      case_study_scenario: 'Apex Infrastructure Finance Ltd. is a notified public financial institution. On 10th January 2024, it filed a Shelf Prospectus with the Registrar of Companies for issuing non-convertible debentures in stages over a period of one year. The first tranche of Rs. 500 Crores was successfully allotted on 25th January 2024.\n\nOn 15th July 2024, prior to issuing the second tranche of Rs. 300 Crores, the company incurred a significant material charge of Rs. 80 Crores on its primary assets in favor of a consortium of lenders, and had also received a regulatory inquiry regarding a disputed statutory tax liability. Some prospective investors who had made advance payments before this disclosure demanded a refund.',
      difficulty: 'hard',
      source: 'MTP',
      attempt: 'May 2025',
      applicable_from: '2024-05-01',
      applicable_till: '2026-11-30',
      amendment_version: 'Sec 31 Companies Act 2013',
      question_text: 'In relation to the second tranche, what statutory document must Apex Infrastructure Finance Ltd. file with the Registrar before the issue, and what is the legal recourse available to investors who made advance subscriptions before the changes were notified?',
      option_a: 'It must file a fresh Full Prospectus; investors cannot withdraw their advance subscriptions',
      option_b: 'It must file an Information Memorandum in Form PAS-2 with the RoC prior to the issue; investors who made advances prior to notification of changes must be given 15 days to withdraw their offer and receive a full refund',
      option_c: 'It must file only an Addendum in newspaper; investors must wait until maturity',
      option_d: 'It must file a Red Herring Prospectus; investors can withdraw within 30 days with 18% penalty interest',
      correct_answer: 'B',
      explanation: 'Under Section 31(2) of the Companies Act, 2013, a company filing a shelf prospectus shall file an Information Memorandum (Form PAS-2) with the Registrar prior to the issue of a second or subsequent offer of securities under such prospectus, containing all material facts relating to new charges created, changes in financial position, etc. Under the Proviso to Section 31(2), where an information memorandum is filed, if the company received applications for the allotment of securities along with advance payments prior to making such change, the company shall intimate the changes to applicants; and if the applicants express a desire to withdraw their application within 15 days of such intimation, the company shall refund all the moneys received.',
      reference: 'Companies Act, 2013, Section 31 & Companies (Prospectus and Allotment of Securities) Rules, 2014, Rule 10',
    },

    // ----------------------------------------------------
    // CA INTERMEDIATE - TAXATION (INCOME TAX & GST)
    // ----------------------------------------------------
    {
      id: 'mcq_inter_tax_001',
      course: 'CA_INTERMEDIATE',
      subject: 'Taxation',
      chapter: 'Heads of Income - Salaries & Total Income',
      topic: 'Default New Tax Regime under Section 115BAC',
      question_type: 'normal',
      difficulty: 'moderate',
      source: 'ICAI Module',
      attempt: 'May 2025',
      applicable_from: '2024-04-01',
      applicable_till: '2025-03-31',
      amendment_version: 'Finance Act 2024 / Sec 115BAC(1A)',
      question_text: 'Mr. Arvind, an employee of a software firm in Bengaluru (age 34), has a Gross Salary of Rs. 14,50,000 for Assessment Year 2025-26. He exercises the default tax regime under Section 115BAC(1A). Which of the following deductions is permissible to him while computing Income under the Head Salaries?',
      option_a: 'House Rent Allowance exemption under Section 10(13A)',
      option_b: 'Standard Deduction under Section 16(ia) of Rs. 75,000',
      option_c: 'Entertainment Allowance under Section 16(ii)',
      option_d: 'Deduction under Section 80C up to Rs. 1,50,000',
      correct_answer: 'B',
      explanation: 'Under the default tax regime of Section 115BAC as amended by Finance (No. 2) Act, 2024, salaried employees are eligible for Standard Deduction under Section 16(ia) enhanced to Rs. 75,000 (previously Rs. 50,000) for AY 2025-26. Deductions under Section 10(13A) (HRA), Section 80C, and Section 16(ii) are not permissible under Section 115BAC.',
      reference: 'Income Tax Act 1961, Section 16(ia) read with Section 115BAC & Finance (No. 2) Act, 2024',
    },
    {
      id: 'mcq_inter_tax_002',
      course: 'CA_INTERMEDIATE',
      subject: 'Taxation',
      chapter: 'Input Tax Credit under GST',
      topic: 'Rule 88A & Order of ITC Utilization',
      question_type: 'normal',
      difficulty: 'hard',
      source: 'RTP',
      attempt: 'May 2025',
      applicable_from: '2024-05-01',
      applicable_till: '2026-11-30',
      amendment_version: 'CGST Rules 2017, Rule 88A',
      question_text: 'According to Rule 88A of the CGST Rules, 2017, which of the following statements represents the mandatory rule for the utilization of Integrated Tax (IGST) credit?',
      option_a: 'IGST credit must first be utilized towards payment of IGST, and the balance, if any, can be utilized towards payment of CGST and SGST/UTGST in any order and in any proportion',
      option_b: 'CGST credit must be completely exhausted before utilizing IGST credit towards SGST',
      option_c: 'IGST credit can only be utilized towards CGST, never towards SGST',
      option_d: 'SGST credit can be utilized towards CGST liability if IGST credit is zero',
      correct_answer: 'A',
      explanation: 'Under Section 49A, Section 49B of the CGST Act, 2017 and Rule 88A of the CGST Rules, 2017, Input Tax Credit on account of Integrated tax shall first be utilized towards payment of Integrated tax, and the remaining amount, if any, may be utilized towards the payment of Central tax and State tax or Union territory tax, as the case may be, in any order and in any proportion. Crucially, ITC on account of Central tax or State tax shall be utilized only after the ITC of Integrated tax has first been completely exhausted.',
      reference: 'CGST Rules, 2017, Rule 88A & Section 49B of CGST Act, 2017',
    },

    // ----------------------------------------------------
    // CA INTERMEDIATE - ADVANCED ACCOUNTING
    // ----------------------------------------------------
    {
      id: 'mcq_inter_acc_001',
      course: 'CA_INTERMEDIATE',
      subject: 'Advanced Accounting',
      chapter: 'Accounting Standards - AS 2 Inventories',
      topic: 'Valuation of Raw Materials',
      question_type: 'normal',
      difficulty: 'moderate',
      source: 'ICAI Module',
      attempt: 'Jan 2025',
      applicable_from: '2024-05-01',
      applicable_till: '2026-11-30',
      amendment_version: 'AS 2 (Revised)',
      question_text: 'According to AS 2 "Valuation of Inventories", materials and other supplies held for use in the production of inventories are not written down below cost if:',
      option_a: 'The finished products in which they will be incorporated are expected to be sold at or above cost',
      option_b: 'Their replacement cost has fallen by more than 25%',
      option_c: 'The company has reported an overall net operating profit in the quarter',
      option_d: 'The raw material has been in stock for more than 180 days',
      correct_answer: 'A',
      explanation: 'Paragraph 24 of AS 2 provides that materials and other supplies held for use in the production of inventories are not written down below cost if the finished products in which they will be incorporated are expected to be sold at or above cost. However, when there has been a decline in the price of materials and it is estimated that the cost of the finished products will exceed net realizable value, the materials are written down to net realizable value (replacement cost).',
      reference: 'AS 2 (Revised) "Valuation of Inventories", Paragraph 24',
    },
    {
      id: 'mcq_inter_acc_002',
      course: 'CA_INTERMEDIATE',
      subject: 'Advanced Accounting',
      chapter: 'Accounting Standards - AS 16 Borrowing Costs',
      topic: 'Qualifying Asset & Capitalisation',
      question_type: 'normal',
      difficulty: 'moderate',
      source: 'PYQ',
      attempt: 'Nov 2024',
      applicable_from: '2024-05-01',
      applicable_till: '2026-11-30',
      amendment_version: 'AS 16',
      question_text: 'Under AS 16, which of the following is defined as a "Qualifying Asset"?',
      option_a: 'An asset that routinely takes less than 30 days to get ready for its intended use or sale',
      option_b: 'An asset that necessarily takes a substantial period of time to get ready for its intended use or sale',
      option_c: 'Any fixed asset acquired for cash without taking any bank loan',
      option_d: 'Inventories that are routinely manufactured or produced in large quantities on a repetitive basis over a short period of time',
      correct_answer: 'B',
      explanation: 'Paragraph 3.2 of AS 16 defines a qualifying asset as "an asset that necessarily takes a substantial period of time to get ready for its intended use or sale." Assets that are ready for their intended use or sale when acquired are not qualifying assets. Inventories routinely manufactured on a repetitive basis over a short period of time are explicitly excluded.',
      reference: 'AS 16 "Borrowing Costs", Paragraph 3.2 & 4',
    },

    // ----------------------------------------------------
    // CA INTERMEDIATE - AUDITING AND ETHICS
    // ----------------------------------------------------
    {
      id: 'mcq_inter_audit_001',
      course: 'CA_INTERMEDIATE',
      subject: 'Auditing and Ethics',
      chapter: 'Nature, Objective and Scope of Audit',
      topic: 'Inherent Limitations of Audit & SA 200',
      question_type: 'normal',
      difficulty: 'easy',
      source: 'ICAI Module',
      attempt: 'May 2025',
      applicable_from: '2024-05-01',
      applicable_till: '2026-11-30',
      amendment_version: 'SA 200 (Revised)',
      question_text: 'According to SA 200 "Overall Objectives of the Independent Auditor", the auditor is able to obtain which level of assurance regarding whether financial statements as a whole are free from material misstatement?',
      option_a: 'Absolute assurance',
      option_b: 'Reasonable assurance, which is a high, but not absolute, level of assurance',
      option_c: 'Limited or negative assurance only',
      option_d: 'Guarantee of future viability of the audited entity',
      correct_answer: 'B',
      explanation: 'Under SA 200, an auditor obtains reasonable assurance, which is a high level of assurance. However, reasonable assurance is not an absolute level of assurance because there are inherent limitations of an audit (e.g. nature of financial reporting, use of judgment, persuasive rather than conclusive nature of audit evidence, possibility of fraud/collusion). An audit is neither an official investigation nor a guarantee of future viability.',
      reference: 'SA 200 "Overall Objectives of the Independent Auditor and the Conduct of an Audit in Accordance with SAs", Paragraph 5 & A28-A52',
    },

    // ----------------------------------------------------
    // CA FOUNDATION - BUSINESS LAWS
    // ----------------------------------------------------
    {
      id: 'mcq_found_law_001',
      course: 'CA_FOUNDATION',
      subject: 'Business Laws',
      chapter: 'Indian Contract Act 1872',
      topic: 'Communication of Acceptance',
      question_type: 'normal',
      difficulty: 'moderate',
      source: 'ICAI Module',
      attempt: 'June 2025',
      applicable_from: '2024-01-01',
      applicable_till: '2026-12-31',
      amendment_version: 'New Scheme Foundation 2024',
      question_text: 'Under Section 4 of the Indian Contract Act, 1872, the communication of an acceptance is complete as against the proposer:',
      option_a: 'When the acceptance comes to the actual knowledge of the proposer',
      option_b: 'When it is put in a course of transmission to him, so as to be out of the power of the acceptor',
      option_c: 'When the contract is signed in the presence of witnesses',
      option_d: 'When the consideration is paid in full',
      correct_answer: 'B',
      explanation: 'Section 4 of the Indian Contract Act, 1872 states that the communication of an acceptance is complete: (i) as against the proposer, when it is put in a course of transmission to him, so as to be out of the power of the acceptor; (ii) as against the acceptor, when it comes to the knowledge of the proposer.',
      reference: 'Indian Contract Act, 1872, Section 4',
    },
    {
      id: 'mcq_found_law_002',
      course: 'CA_FOUNDATION',
      subject: 'Business Laws',
      chapter: 'Sale of Goods Act 1930',
      topic: 'Doctrine of Caveat Emptor & Exceptions',
      question_type: 'normal',
      difficulty: 'moderate',
      source: 'PYQ',
      attempt: 'Jan 2025',
      applicable_from: '2024-01-01',
      applicable_till: '2026-12-31',
      amendment_version: 'Sale of Goods Act 1930',
      question_text: 'Which of the following is NOT an exception to the doctrine of "Caveat Emptor" (Let the buyer beware) under the Sale of Goods Act, 1930?',
      option_a: 'Where the buyer makes known to the seller the particular purpose for which goods are required, relying on seller skill and judgment',
      option_b: 'Where goods are bought by description from a seller who deals in goods of that description (implied condition as to merchantable quality)',
      option_c: 'Where goods are purchased under a patent or trade name with no reliance on the seller skill and judgment',
      option_d: 'Where the seller is guilty of fraud and actively conceals a latent defect in goods',
      correct_answer: 'C',
      explanation: 'Under the proviso to Section 16(1) of the Sale of Goods Act, 1930, in the case of a contract for the sale of a specified article under its patent or other trade name, there is no implied condition as to its fitness for any particular purpose. Hence, buying under a patent/trade name without reliance on seller is a direct application of the rule Caveat Emptor, NOT an exception.',
      reference: 'Sale of Goods Act, 1930, Section 16(1) proviso',
    },

    // ----------------------------------------------------
    // CA FOUNDATION - QUANTITATIVE APTITUDE
    // ----------------------------------------------------
    {
      id: 'mcq_found_qa_001',
      course: 'CA_FOUNDATION',
      subject: 'Quantitative Aptitude',
      chapter: 'Time Value of Money',
      topic: 'Effective Rate of Interest',
      question_type: 'normal',
      difficulty: 'moderate',
      source: 'ICAI Module',
      attempt: 'June 2025',
      applicable_from: '2024-01-01',
      applicable_till: '2026-12-31',
      amendment_version: 'Foundation Paper 3',
      question_text: 'A bank offers a nominal rate of interest of 8% per annum compounded quarterly. What is the effective annual rate of interest (rounded to two decimal places)?',
      option_a: '8.00%',
      option_b: '8.24%',
      option_c: '8.32%',
      option_d: '8.16%',
      correct_answer: 'B',
      explanation: 'Effective rate E = (1 + i/m)^m - 1. Here, i = 0.08, m = 4 quarters per year. E = (1 + 0.08/4)^4 - 1 = (1 + 0.02)^4 - 1 = (1.02)^4 - 1 = 1.082432 - 1 = 0.082432 = 8.24% per annum.',
      reference: 'ICAI Study Material Foundation Paper 3 Mathematics - Time Value of Money',
    },

    // ----------------------------------------------------
    // CA FOUNDATION - BUSINESS ECONOMICS
    // ----------------------------------------------------
    {
      id: 'mcq_found_eco_001',
      course: 'CA_FOUNDATION',
      subject: 'Business Economics',
      chapter: 'Theory of Demand and Supply',
      topic: 'Price Elasticity of Demand',
      question_type: 'normal',
      difficulty: 'easy',
      source: 'ICAI Module',
      attempt: 'June 2025',
      applicable_from: '2024-01-01',
      applicable_till: '2026-12-31',
      amendment_version: 'Foundation Paper 4',
      question_text: 'If a 10% decrease in the price of a commodity leads to a 10% increase in the total quantity demanded, what is the price elasticity of demand (Ep) using the percentage method?',
      option_a: 'Ep = 0 (Perfectively inelastic)',
      option_b: 'Ep = 1 (Unitary elastic)',
      option_c: 'Ep > 1 (Relatively elastic)',
      option_d: 'Ep = infinity (Perfectively elastic)',
      correct_answer: 'B',
      explanation: 'Price elasticity of demand = (% change in quantity demanded) / (% change in price) = 10% / 10% = 1. When Ep = 1, it represents Unitary Elastic demand, where total expenditure remains unchanged when price changes.',
      reference: 'ICAI Study Material Foundation Paper 4 Economics Ch 2',
    },

    // ----------------------------------------------------
    // CA FINAL - FINANCIAL REPORTING
    // ----------------------------------------------------
    {
      id: 'mcq_final_fr_001',
      course: 'CA_FINAL',
      subject: 'Financial Reporting',
      chapter: 'Revenue from Contracts with Customers - Ind AS 115',
      topic: 'Five-Step Revenue Recognition Model',
      question_type: 'normal',
      difficulty: 'hard',
      source: 'ICAI Module',
      attempt: 'May 2025',
      applicable_from: '2024-05-01',
      applicable_till: '2026-11-30',
      amendment_version: 'Ind AS 115 (MCA Roadmap)',
      question_text: 'Under Ind AS 115, an entity transfers control of a good or service over time (and hence recognizes revenue over time) if ANY of the following criteria is met, EXCEPT:',
      option_a: 'The customer simultaneously receives and consumes the benefits provided by the entity performance as the entity performs',
      option_b: 'The entity performance creates or enhances an asset that the customer controls as the asset is created or enhanced',
      option_c: 'The entity performance does not create an asset with an alternative use to the entity, and the entity has an enforceable right to payment for performance completed to date',
      option_d: 'The entity has transferred significant legal title, physical possession, and accepted all insurance risks at the date of delivery',
      correct_answer: 'D',
      explanation: 'Paragraph 35 of Ind AS 115 specifies three explicit criteria for recognizing revenue over time (options A, B, and C). Option D describes indicators of the transfer of control at a point in time under Paragraph 38 (transfer of physical possession, legal title, etc.), NOT over time.',
      reference: 'Ind AS 115 "Revenue from Contracts with Customers", Paragraph 35 & 38',
    },
    {
      id: 'mcq_final_fr_002',
      course: 'CA_FINAL',
      subject: 'Financial Reporting',
      chapter: 'Leases - Ind AS 116',
      topic: 'Lessee Accounting & Right-of-Use Asset',
      question_type: 'normal',
      difficulty: 'hard',
      source: 'RTP',
      attempt: 'May 2025',
      applicable_from: '2024-05-01',
      applicable_till: '2026-11-30',
      amendment_version: 'Ind AS 116',
      question_text: 'Under Ind AS 116, at the commencement date of a lease, a lessee is permitted to elect NOT to recognize a Right-of-Use (ROU) asset and a lease liability for which of the following categories of leases?',
      option_a: 'Short-term leases (lease term of 12 months or less with no purchase option) and leases for which the underlying asset is of low value',
      option_b: 'Operating leases of real estate properties where annual rental exceeds Rs. 10 Lakhs',
      option_c: 'Any finance lease where the interest rate implicit in the lease is above the bank benchmark lending rate',
      option_d: 'Sale and leaseback transactions involving plant and machinery',
      correct_answer: 'A',
      explanation: 'Paragraph 5 of Ind AS 116 provides two explicit recognition exemptions: a lessee may elect not to apply the standard ROU asset and lease liability recognition requirements to: (a) short-term leases (leases that, at the commencement date, have a lease term of 12 months or less and do not contain a purchase option); and (b) leases for which the underlying asset is of low value (e.g. personal computers, office furniture). For these leases, lease payments are recognized as an expense on either a straight-line basis or another systematic basis.',
      reference: 'Ind AS 116 "Leases", Paragraph 5 & 6',
    },

    // ----------------------------------------------------
    // CA FINAL - ADVANCED FINANCIAL MANAGEMENT (AFM)
    // ----------------------------------------------------
    {
      id: 'mcq_final_afm_001',
      course: 'CA_FINAL',
      subject: 'Advanced Financial Management',
      chapter: 'Foreign Exchange Exposure and Risk Management',
      topic: 'Interest Rate Parity (IRP)',
      question_type: 'normal',
      difficulty: 'hard',
      source: 'PYQ',
      attempt: 'Nov 2024',
      applicable_from: '2024-05-01',
      applicable_till: '2026-11-30',
      amendment_version: 'CA Final Paper 2 AFM',
      question_text: 'According to Covered Interest Rate Parity (CIRP), if the nominal annual interest rate in India is 7.00% and in the United States is 4.00%, what is the expected state of the Forward US Dollar (USD) relative to the Spot rate against the Indian Rupee (INR)?',
      option_a: 'The US Dollar should trade at a forward premium against the Indian Rupee',
      option_b: 'The US Dollar should trade at a forward discount against the Indian Rupee',
      option_c: 'The Spot rate and Forward rate must remain exactly equal to prevent triangular arbitrage',
      option_d: 'The forward rate depends solely on the purchasing power parity of perishable commodities',
      correct_answer: 'A',
      explanation: 'Under CIRP: F / S = (1 + r_base) / (1 + r_quote), or Forward Premium / Discount of Currency B approx = r_home - r_foreign. Since the interest rate in India (home currency INR, 7%) is higher than in the US (4%), the higher interest rate currency (INR) must depreciate in the forward market, which conversely means that the foreign currency with lower interest rate (USD) will trade at a Forward Premium of approximately 3% per annum to eliminate covered arbitrage opportunities.',
      reference: 'ICAI Study Material Final Paper 2 AFM - Forex Risk Management',
    },
  ];

  const insertStmt = db.prepare(`
    INSERT INTO mcq_questions (
      id, course, subject, chapter, topic, question_type, case_study_scenario,
      difficulty, source, attempt, applicable_from, applicable_till, amendment_version,
      question_text, option_a, option_b, option_c, option_d, correct_answer,
      explanation, reference, status, created_by, reviewed_by, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, 'published', 'MCQ_ADMIN', 'MCQ_ADMIN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
    ON CONFLICT(id) DO UPDATE SET
      course = excluded.course,
      subject = excluded.subject,
      chapter = excluded.chapter,
      topic = excluded.topic,
      question_type = excluded.question_type,
      case_study_scenario = excluded.case_study_scenario,
      difficulty = excluded.difficulty,
      source = excluded.source,
      attempt = excluded.attempt,
      question_text = excluded.question_text,
      option_a = excluded.option_a,
      option_b = excluded.option_b,
      option_c = excluded.option_c,
      option_d = excluded.option_d,
      correct_answer = excluded.correct_answer,
      explanation = excluded.explanation,
      reference = excluded.reference,
      status = 'published',
      updated_at = CURRENT_TIMESTAMP
  `);

  for (const q of sampleQuestions) {
    insertStmt.run(
      q.id,
      q.course,
      q.subject,
      q.chapter,
      q.topic,
      q.question_type,
      q.case_study_scenario || null,
      q.difficulty,
      q.source,
      q.attempt,
      q.applicable_from,
      q.applicable_till,
      q.amendment_version,
      q.question_text,
      q.option_a,
      q.option_b,
      q.option_c,
      q.option_d,
      q.correct_answer,
      q.explanation,
      q.reference
    );
  }
}

// ==========================================
// 3. CURRICULUM STATS & FILTER CHECKING
// ==========================================
export function getCurriculumStats() {
  const rows = db.prepare(`
    SELECT course, subject, chapter, question_type, difficulty, count(*) as count
    FROM mcq_questions
    WHERE status = 'published'
      AND status != 'DELETED'
      AND (source_material_id IS NULL OR (
        source_material_id NOT IN (SELECT id FROM mcq_materials WHERE status = 'DELETED')
        AND source_material_id NOT IN (SELECT entity_id FROM tombstones WHERE collection_name = 'mcq_materials')
      ))
    GROUP BY course, subject, chapter, question_type, difficulty
  `).all() as Array<{
    course: string;
    subject: string;
    chapter: string;
    question_type: string;
    difficulty: string;
    count: number;
  }>;

  return rows;
}

// ==========================================
// 4. PRACTICE & MOCK TEST SESSION MANAGEMENT
// ==========================================
export function createSession(studentId: string, params: {
  course: McqCourse;
  subject: string;
  chapter?: string;
  topic?: string;
  questionType?: McqQuestionType | 'mixed';
  difficulty?: McqDifficulty | 'mixed';
  sessionType: McqSessionType;
  requestedCount?: number;
  durationMinutes?: number;
}): { session: McqSession; questions: any[] } | { error: string; availableCount: number } {
  const {
    course,
    subject,
    chapter,
    topic,
    questionType = 'mixed',
    difficulty = 'mixed',
    sessionType = 'practice',
    requestedCount = 10,
    durationMinutes,
  } = params;

  let selectedQuestions: any[] = [];
  let availableCount = 0;

  if (questionType === 'case_based') {
    // ----------------------------------------------------
    // CASE-BASED: Filtering & Randomization at Case Level
    // ----------------------------------------------------
    const caseConditions: string[] = [
      "c.status = 'published'",
      "c.status != 'DELETED'",
      "c.course = ?",
      "(c.source_material_id IS NULL OR (c.source_material_id NOT IN (SELECT id FROM mcq_materials WHERE status = 'DELETED') AND c.source_material_id NOT IN (SELECT entity_id FROM tombstones WHERE collection_name = 'mcq_materials')))",
      "EXISTS (SELECT 1 FROM mcq_questions q WHERE q.case_id = c.case_id AND q.status = 'published' AND q.status != 'DELETED')"
    ];
    const caseParams: any[] = [course];

    if (subject && subject !== 'ALL') {
      caseConditions.push('c.subject = ?');
      caseParams.push(subject);
    }
    if (chapter && chapter !== 'ALL') {
      caseConditions.push('c.chapter = ?');
      caseParams.push(chapter);
    }
    if (topic && topic !== 'ALL') {
      caseConditions.push('c.topic = ?');
      caseParams.push(topic);
    }
    if (difficulty && difficulty !== 'mixed') {
      caseConditions.push('c.case_difficulty = ?');
      caseParams.push(difficulty);
    }

    const availableCases = db.prepare(`
      SELECT * FROM mcq_cases c
      WHERE ${caseConditions.join(' AND ')}
      ORDER BY RANDOM()
    `).all(...caseParams) as any[];

    if (availableCases.length === 0) {
      return {
        error: 'Not enough case-based questions available for this selection. Please adjust your filters.',
        availableCount: 0,
      };
    }

    // For each case bundle, load child questions strictly in sequence order
    for (const c of availableCases) {
      const childQuestions = db.prepare(`
        SELECT q.*, c.case_title, c.case_scenario as parent_case_scenario, c.case_difficulty
        FROM mcq_questions q
        JOIN mcq_cases c ON q.case_id = c.case_id
        WHERE q.case_id = ? AND q.status = 'published' AND q.status != 'DELETED'
        ORDER BY COALESCE(q.case_sequence, 999) ASC, q.id ASC
      `).all(c.case_id) as any[];

      for (const child of childQuestions) {
        child.case_study_scenario = child.case_study_scenario || c.case_scenario;
        child.case_title = c.case_title;
        child.difficulty = c.case_difficulty || child.difficulty;
        selectedQuestions.push(child);
        if (selectedQuestions.length >= requestedCount) {
          break;
        }
      }
      if (selectedQuestions.length >= requestedCount) {
        break;
      }
    }
    availableCount = selectedQuestions.length;
  } else {
    // ----------------------------------------------------
    // NORMAL OR MIXED: Query questions table
    // ----------------------------------------------------
    const conditions: string[] = [
      "q.status = 'published'",
      "q.status != 'DELETED'",
      "q.course = ?",
      "(q.source_material_id IS NULL OR (q.source_material_id NOT IN (SELECT id FROM mcq_materials WHERE status = 'DELETED') AND q.source_material_id NOT IN (SELECT entity_id FROM tombstones WHERE collection_name = 'mcq_materials')))"
    ];
    const queryParams: any[] = [course];

    if (subject && subject !== 'ALL') {
      conditions.push('q.subject = ?');
      queryParams.push(subject);
    }
    if (chapter && chapter !== 'ALL') {
      conditions.push('q.chapter = ?');
      queryParams.push(chapter);
    }
    if (topic && topic !== 'ALL') {
      conditions.push('q.topic = ?');
      queryParams.push(topic);
    }
    if (questionType === 'normal') {
      conditions.push("(q.question_type = 'normal' OR q.question_type IS NULL)");
      conditions.push("(q.case_id IS NULL OR q.case_id = '')");
    }
    if (difficulty && difficulty !== 'mixed') {
      conditions.push('q.difficulty = ?');
      queryParams.push(difficulty);
    }

    const countRow = db.prepare(`
      SELECT count(*) as total FROM mcq_questions q
      WHERE ${conditions.join(' AND ')}
    `).get(...queryParams) as { total: number };

    availableCount = countRow?.total || 0;

    if (availableCount === 0) {
      return {
        error: 'Not enough questions available for this selection. Please adjust your filters.',
        availableCount: 0,
      };
    }

    const limit = Math.min(requestedCount, availableCount);

    selectedQuestions = db.prepare(`
      SELECT q.*, c.case_title, c.case_scenario as parent_case_scenario
      FROM mcq_questions q
      LEFT JOIN mcq_cases c ON q.case_id = c.case_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY RANDOM()
      LIMIT ?
    `).all(...queryParams, limit) as any[];
  }

  const sessionId = `mcq_sess_${crypto.randomBytes(8).toString('hex')}`;
  const totalQuestions = selectedQuestions.length;
  const durationSeconds = durationMinutes ? durationMinutes * 60 : (sessionType === 'mock' ? totalQuestions * 120 : 0);

  db.prepare(`
    INSERT INTO mcq_sessions (
      id, student_id, session_type, course, subject, chapter, topic,
      difficulty, total_questions, duration_seconds, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'in_progress', CURRENT_TIMESTAMP)
  `).run(
    sessionId,
    studentId,
    sessionType,
    course,
    subject,
    chapter || null,
    topic || null,
    difficulty,
    totalQuestions,
    durationSeconds
  );

  // Pre-seed blank response placeholders
  const insertResponse = db.prepare(`
    INSERT INTO mcq_user_responses (id, session_id, student_id, question_id, answered_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);

  for (const q of selectedQuestions) {
    insertResponse.run(`resp_${crypto.randomBytes(8).toString('hex')}`, sessionId, studentId, q.id);
  }

  // Check bookmarks for user
  const bookmarkedIds = new Set(
    (db.prepare('SELECT question_id FROM mcq_bookmarks WHERE student_id = ?').all(studentId) as Array<{ question_id: string }>).map((b) => b.question_id)
  );

  // Sanitize questions based on mode (if mock, hide correct answer & explanation)
  const clientQuestions = selectedQuestions.map((q) => ({
    id: q.id,
    course: q.course,
    subject: q.subject,
    chapter: q.chapter,
    topic: q.topic,
    questionType: q.question_type,
    caseId: q.case_id || undefined,
    caseTitle: q.case_title || undefined,
    caseSequence: q.case_sequence != null ? q.case_sequence : undefined,
    caseStudyScenario: q.case_study_scenario || q.parent_case_scenario || undefined,
    difficulty: q.difficulty,
    source: q.source,
    attempt: q.attempt,
    applicableFrom: q.applicable_from || undefined,
    applicableTill: q.applicable_till || undefined,
    amendmentVersion: q.amendment_version || undefined,
    generationMethod: q.generation_method || undefined,
    questionText: q.question_text,
    optionA: q.option_a,
    optionB: q.option_b,
    optionC: q.option_c,
    optionD: q.option_d,
    correctAnswer: sessionType === 'practice' ? q.correct_answer : undefined,
    explanation: sessionType === 'practice' ? q.explanation : undefined,
    reference: sessionType === 'practice' ? q.reference : undefined,
    isBookmarked: bookmarkedIds.has(q.id),
  }));

  const sessionRow = db.prepare('SELECT * FROM mcq_sessions WHERE id = ?').get(sessionId) as any;

  return {
    session: {
      id: sessionRow.id,
      studentId: sessionRow.student_id,
      sessionType: sessionRow.session_type,
      course: sessionRow.course,
      subject: sessionRow.subject,
      chapter: sessionRow.chapter,
      topic: sessionRow.topic,
      difficulty: sessionRow.difficulty,
      totalQuestions: sessionRow.total_questions,
      attemptedQuestions: 0,
      correctCount: 0,
      incorrectCount: 0,
      skippedCount: totalQuestions,
      score: 0,
      accuracyPercentage: 0,
      timeSpentSeconds: 0,
      durationSeconds: sessionRow.duration_seconds,
      status: 'in_progress',
      currentQuestionId: clientQuestions[0]?.id || null,
      currentQuestionIndex: 0,
      currentCaseId: clientQuestions[0]?.caseId || null,
      questionIds: clientQuestions.map((q) => q.id),
      createdAt: sessionRow.created_at,
    },
    questions: clientQuestions,
  };
}

// ==========================================
// 5. GET SESSION DETAILS & CURRENT STATE
// ==========================================
export function getSession(sessionId: string, studentId: string) {
  const session = db.prepare('SELECT * FROM mcq_sessions WHERE id = ? AND student_id = ?').get(sessionId, studentId) as any;
  if (!session) return null;

  const responses = db.prepare(`
    SELECT r.*, q.course, q.subject, q.chapter, q.topic, q.question_type, q.case_id, q.case_sequence,
           q.case_study_scenario, c.case_title, c.case_scenario as parent_case_scenario,
           q.difficulty, q.source, q.attempt, q.applicable_from, q.applicable_till,
           q.amendment_version, q.generation_method, q.question_text,
           q.option_a, q.option_b, q.option_c, q.option_d, q.correct_answer, q.explanation, q.reference
    FROM mcq_user_responses r
    JOIN mcq_questions q ON q.id = r.question_id
    LEFT JOIN mcq_cases c ON q.case_id = c.case_id
    WHERE r.session_id = ?
    ORDER BY r.id ASC
  `).all(sessionId) as any[];

  const bookmarkedIds = new Set(
    (db.prepare('SELECT question_id FROM mcq_bookmarks WHERE student_id = ?').all(studentId) as Array<{ question_id: string }>).map((b) => b.question_id)
  );

  const isCompleted = session.status === 'completed';

  const questions = responses.map((r) => {
    let eliminated: string[] = [];
    try {
      if (r.eliminated_options) eliminated = JSON.parse(r.eliminated_options);
    } catch {}

    const showSolution = isCompleted || session.session_type === 'practice';

    return {
      id: r.question_id,
      course: r.course,
      subject: r.subject,
      chapter: r.chapter,
      topic: r.topic,
      questionType: r.question_type,
      caseId: r.case_id || undefined,
      caseTitle: r.case_title || undefined,
      caseSequence: r.case_sequence != null ? r.case_sequence : undefined,
      caseStudyScenario: r.case_study_scenario || r.parent_case_scenario || undefined,
      difficulty: r.difficulty,
      source: r.source,
      attempt: r.attempt,
      applicableFrom: r.applicable_from || undefined,
      applicableTill: r.applicable_till || undefined,
      amendmentVersion: r.amendment_version || undefined,
      generationMethod: r.generation_method || undefined,
      questionText: r.question_text,
      optionA: r.option_a,
      optionB: r.option_b,
      optionC: r.option_c,
      optionD: r.option_d,
      correctAnswer: showSolution ? r.correct_answer : undefined,
      explanation: showSolution ? r.explanation : undefined,
      reference: showSolution ? r.reference : undefined,
      isBookmarked: bookmarkedIds.has(r.question_id),
      userResponse: {
        selectedOption: r.selected_option,
        isCorrect: r.is_correct === 1,
        isMarkedForReview: r.is_marked_for_review === 1,
        eliminatedOptions: eliminated,
        timeTakenSeconds: r.time_taken_seconds || 0,
      },
    };
  });

  const firstUnanswered = questions.findIndex((q) => !q.userResponse?.selectedOption);
  const currentIdx = firstUnanswered >= 0 ? firstUnanswered : 0;

  return {
    session: {
      id: session.id,
      studentId: session.student_id,
      sessionType: session.session_type,
      course: session.course,
      subject: session.subject,
      chapter: session.chapter,
      topic: session.topic,
      difficulty: session.difficulty,
      totalQuestions: session.total_questions,
      attemptedQuestions: session.attempted_questions,
      correctCount: session.correct_count,
      incorrectCount: session.incorrect_count,
      skippedCount: session.skipped_count,
      score: session.score,
      accuracyPercentage: session.accuracy_percentage,
      timeSpentSeconds: session.time_spent_seconds,
      durationSeconds: session.duration_seconds,
      status: session.status,
      currentQuestionId: questions[currentIdx]?.id || null,
      currentQuestionIndex: currentIdx,
      currentCaseId: questions[currentIdx]?.caseId || null,
      questionIds: questions.map((q) => q.id),
      createdAt: session.created_at,
      completedAt: session.completed_at,
    },
    questions,
  };
}

// ==========================================
// 6. RECORD USER ANSWER
// ==========================================
export function submitAnswer(sessionId: string, studentId: string, payload: {
  questionId: string;
  selectedOption: 'A' | 'B' | 'C' | 'D' | null;
  isMarkedForReview?: boolean;
  eliminatedOptions?: ('A' | 'B' | 'C' | 'D')[];
  timeTakenSeconds?: number;
}) {
  const { questionId, selectedOption, isMarkedForReview = false, eliminatedOptions = [], timeTakenSeconds = 0 } = payload;

  const session = db.prepare('SELECT * FROM mcq_sessions WHERE id = ? AND student_id = ?').get(sessionId, studentId) as any;
  if (!session) throw new Error('Session not found');

  const question = db.prepare('SELECT * FROM mcq_questions WHERE id = ?').get(questionId) as any;
  if (!question) throw new Error('Question not found');

  const isCorrect = selectedOption ? (selectedOption === question.correct_answer ? 1 : 0) : 0;

  db.prepare(`
    UPDATE mcq_user_responses
    SET selected_option = ?,
        is_correct = ?,
        is_marked_for_review = ?,
        eliminated_options = ?,
        time_taken_seconds = ?,
        answered_at = CURRENT_TIMESTAMP
    WHERE session_id = ? AND student_id = ? AND question_id = ?
  `).run(
    selectedOption,
    isCorrect,
    isMarkedForReview ? 1 : 0,
    JSON.stringify(eliminatedOptions),
    timeTakenSeconds,
    sessionId,
    studentId,
    questionId
  );

  return {
    questionId: question.id,
    isCorrect: Boolean(isCorrect),
    correctAnswer: question.correct_answer,
    explanation: question.explanation,
    reference: question.reference,
  };
}

// ==========================================
// 7. FINISH & SCORE SESSION
// ==========================================
export function finishSession(sessionId: string, studentId: string, timeSpentSeconds: number = 0) {
  const session = db.prepare('SELECT * FROM mcq_sessions WHERE id = ? AND student_id = ?').get(sessionId, studentId) as any;
  if (!session) throw new Error('Session not found');

  const responses = db.prepare(`
    SELECT r.*, q.correct_answer, q.course, q.subject, q.chapter
    FROM mcq_user_responses r
    JOIN mcq_questions q ON q.id = r.question_id
    WHERE r.session_id = ?
  `).all(sessionId) as any[];

  let attempted = 0;
  let correct = 0;
  let incorrect = 0;
  let skipped = 0;
  let score = 0;

  // ICAI Scoring Rules:
  // Foundation: +1 for correct, -0.25 for incorrect
  // Inter & Final: +1 for correct, 0 for incorrect (no negative marking)
  const isFoundation = session.course === 'CA_FOUNDATION';
  const negativePenalty = isFoundation ? 0.25 : 0;

  for (const r of responses) {
    if (r.selected_option) {
      attempted++;
      if (r.selected_option === r.correct_answer) {
        correct++;
        score += 1;

        // Auto resolve in wrong vault if previously wrong
        try {
          db.prepare('UPDATE mcq_wrong_vault SET resolved = 1 WHERE student_id = ? AND question_id = ?').run(studentId, r.question_id);
        } catch {}
      } else {
        incorrect++;
        score -= negativePenalty;

        // Record in wrong questions vault for mistake review
        try {
          db.prepare(`
            INSERT INTO mcq_wrong_vault (id, student_id, question_id, last_wrong_option, wrong_count, resolved, last_attempted_at)
            VALUES (?, ?, ?, ?, 1, 0, CURRENT_TIMESTAMP)
            ON CONFLICT(student_id, question_id) DO UPDATE SET
              last_wrong_option = excluded.last_wrong_option,
              wrong_count = mcq_wrong_vault.wrong_count + 1,
              resolved = 0,
              last_attempted_at = CURRENT_TIMESTAMP
          `).run(`wv_${crypto.randomBytes(8).toString('hex')}`, studentId, r.question_id, r.selected_option);
        } catch {}
      }
    } else {
      skipped++;
    }
  }

  score = Math.max(0, Math.round(score * 100) / 100);
  const accuracy = attempted > 0 ? Math.round((correct / attempted) * 100) : 0;

  db.prepare(`
    UPDATE mcq_sessions
    SET status = 'completed',
        attempted_questions = ?,
        correct_count = ?,
        incorrect_count = ?,
        skipped_count = ?,
        score = ?,
        accuracy_percentage = ?,
        time_spent_seconds = ?,
        completed_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(attempted, correct, incorrect, skipped, score, accuracy, timeSpentSeconds, sessionId);

  return getSession(sessionId, studentId);
}

// ==========================================
// 8. STUDENT PROGRESS & ANALYTICS
// ==========================================
export function getStudentProgress(studentId: string): McqStudentProgress {
  const completedSessions = db.prepare(`
    SELECT * FROM mcq_sessions
    WHERE student_id = ? AND status = 'completed'
    ORDER BY completed_at DESC
  `).all(studentId) as any[];

  let totalAttempted = 0;
  let totalCorrect = 0;
  let totalIncorrect = 0;
  let totalTime = 0;

  for (const s of completedSessions) {
    totalAttempted += s.attempted_questions || 0;
    totalCorrect += s.correct_count || 0;
    totalIncorrect += s.incorrect_count || 0;
    totalTime += s.time_spent_seconds || 0;
  }

  const overallAccuracy = totalAttempted > 0 ? Math.round((totalCorrect / totalAttempted) * 100) : 0;

  // Calculate practice streak (consecutive days with completed sessions)
  const streakDays = computeStreak(completedSessions.map((s) => s.completed_at || s.created_at));

  // Subject breakdown
  const subjectMap = new Map<string, { total: number; correct: number }>();
  const responses = db.prepare(`
    SELECT r.is_correct, q.subject
    FROM mcq_user_responses r
    JOIN mcq_questions q ON q.id = r.question_id
    JOIN mcq_sessions s ON s.id = r.session_id
    WHERE r.student_id = ? AND s.status = 'completed' AND r.selected_option IS NOT NULL
  `).all(studentId) as Array<{ is_correct: number; subject: string }>;

  for (const r of responses) {
    const cur = subjectMap.get(r.subject) || { total: 0, correct: 0 };
    cur.total++;
    if (r.is_correct === 1) cur.correct++;
    subjectMap.set(r.subject, cur);
  }

  const subjectBreakdown = Array.from(subjectMap.entries()).map(([subject, stats]) => ({
    subject,
    total: stats.total,
    correct: stats.correct,
    accuracy: stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0,
  }));

  const wrongVaultCount = (db.prepare('SELECT count(*) as count FROM mcq_wrong_vault WHERE student_id = ? AND resolved = 0').get(studentId) as any)?.count || 0;
  const bookmarkCount = (db.prepare('SELECT count(*) as count FROM mcq_bookmarks WHERE student_id = ?').get(studentId) as any)?.count || 0;

  const recentSessions: McqSession[] = completedSessions.slice(0, 5).map((s) => ({
    id: s.id,
    studentId: s.student_id,
    sessionType: s.session_type,
    course: s.course,
    subject: s.subject,
    chapter: s.chapter,
    topic: s.topic,
    difficulty: s.difficulty,
    totalQuestions: s.total_questions,
    attemptedQuestions: s.attempted_questions,
    correctCount: s.correct_count,
    incorrectCount: s.incorrect_count,
    skippedCount: s.skipped_count,
    score: s.score,
    accuracyPercentage: s.accuracy_percentage,
    timeSpentSeconds: s.time_spent_seconds,
    durationSeconds: s.duration_seconds,
    status: s.status,
    createdAt: s.created_at,
    completedAt: s.completed_at,
  }));

  return {
    totalAttempted,
    totalCorrect,
    totalIncorrect,
    overallAccuracy,
    streakDays,
    totalPracticeTimeSeconds: totalTime,
    subjectBreakdown,
    recentSessions,
    wrongVaultCount,
    bookmarkCount,
  };
}

function computeStreak(dateStrings: string[]): number {
  if (!dateStrings.length) return 0;
  const days = new Set(dateStrings.map((d) => new Date(d).toISOString().slice(0, 10)));
  const sorted = Array.from(days).sort().reverse();

  let streak = 0;
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  // If student did not practice today or yesterday, streak is 0
  if (!sorted.includes(today) && !sorted.includes(yesterday)) {
    return 0;
  }

  let checkDate = sorted.includes(today) ? new Date() : new Date(Date.now() - 86400000);

  while (true) {
    const key = checkDate.toISOString().slice(0, 10);
    if (days.has(key)) {
      streak++;
      checkDate = new Date(checkDate.getTime() - 86400000);
    } else {
      break;
    }
  }

  return streak;
}

// ==========================================
// 9. BOOKMARKS & WRONG VAULT
// ==========================================
export function toggleBookmark(studentId: string, questionId: string, notes?: string) {
  const existing = db.prepare('SELECT id FROM mcq_bookmarks WHERE student_id = ? AND question_id = ?').get(studentId, questionId) as { id: string } | undefined;

  if (existing) {
    db.prepare('DELETE FROM mcq_bookmarks WHERE id = ?').run(existing.id);
    return { bookmarked: false };
  } else {
    const id = `bm_${crypto.randomBytes(8).toString('hex')}`;
    db.prepare('INSERT INTO mcq_bookmarks (id, student_id, question_id, notes) VALUES (?, ?, ?, ?)').run(id, studentId, questionId, notes || null);
    return { bookmarked: true };
  }
}

export function getBookmarks(studentId: string) {
  const rows = db.prepare(`
    SELECT b.id as bookmark_id, b.notes, b.created_at as bookmarked_at, q.*
    FROM mcq_bookmarks b
    JOIN mcq_questions q ON q.id = b.question_id
    WHERE b.student_id = ?
    ORDER BY b.created_at DESC
  `).all(studentId) as any[];

  return rows.map((r) => ({
    id: r.bookmark_id,
    notes: r.notes,
    bookmarkedAt: r.bookmarked_at,
    question: {
      id: r.id,
      course: r.course,
      subject: r.subject,
      chapter: r.chapter,
      topic: r.topic,
      questionType: r.question_type,
      caseStudyScenario: r.case_study_scenario,
      difficulty: r.difficulty,
      source: r.source,
      attempt: r.attempt,
      questionText: r.question_text,
      optionA: r.option_a,
      optionB: r.option_b,
      optionC: r.option_c,
      optionD: r.option_d,
      correctAnswer: r.correct_answer,
      explanation: r.explanation,
      reference: r.reference,
    },
  }));
}

export function getWrongVault(studentId: string, includeResolved: boolean = false) {
  const filter = includeResolved ? '' : 'AND wv.resolved = 0';
  const rows = db.prepare(`
    SELECT wv.id as vault_id, wv.last_wrong_option, wv.wrong_count, wv.resolved, wv.last_attempted_at, q.*
    FROM mcq_wrong_vault wv
    JOIN mcq_questions q ON q.id = wv.question_id
    WHERE wv.student_id = ? ${filter}
    ORDER BY wv.last_attempted_at DESC
  `).all(studentId) as any[];

  return rows.map((r) => ({
    id: r.vault_id,
    lastWrongOption: r.last_wrong_option,
    wrongCount: r.wrong_count,
    resolved: Boolean(r.resolved),
    lastAttemptedAt: r.last_attempted_at,
    question: {
      id: r.id,
      course: r.course,
      subject: r.subject,
      chapter: r.chapter,
      topic: r.topic,
      questionType: r.question_type,
      caseStudyScenario: r.case_study_scenario,
      difficulty: r.difficulty,
      source: r.source,
      attempt: r.attempt,
      questionText: r.question_text,
      optionA: r.option_a,
      optionB: r.option_b,
      optionC: r.option_c,
      optionD: r.option_d,
      correctAnswer: r.correct_answer,
      explanation: r.explanation,
      reference: r.reference,
    },
  }));
}

export function resolveWrongQuestion(studentId: string, questionId: string) {
  db.prepare('UPDATE mcq_wrong_vault SET resolved = 1 WHERE student_id = ? AND question_id = ?').run(studentId, questionId);
  return { success: true };
}

// ==========================================
// 10. MCQ ADMIN OPERATIONS
// ==========================================
export function getAdminQuestions(filters: {
  course?: string;
  subject?: string;
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  const { course, subject, status, search, page = 1, limit = 20 } = filters;
  const conditions: string[] = ["status != 'DELETED'"];
  const params: any[] = [];

  if (course && course !== 'ALL') {
    conditions.push('course = ?');
    params.push(course);
  }
  if (subject && subject !== 'ALL') {
    conditions.push('subject = ?');
    params.push(subject);
  }
  if (status && status !== 'ALL') {
    conditions.push('status = ?');
    params.push(status);
  }
  if (search && search.trim()) {
    conditions.push('(question_text LIKE ? OR chapter LIKE ? OR topic LIKE ? OR reference LIKE ?)');
    const term = `%${search.trim()}%`;
    params.push(term, term, term, term);
  }

  const offset = (page - 1) * limit;

  const countRow = db.prepare(`SELECT count(*) as total FROM mcq_questions WHERE ${conditions.join(' AND ')}`).get(...params) as { total: number };
  const rows = db.prepare(`
    SELECT q.*, c.case_title, c.case_scenario as parent_case_scenario
    FROM mcq_questions q
    LEFT JOIN mcq_cases c ON q.case_id = c.case_id
    WHERE ${conditions.map((c) => `q.${c}`).join(' AND ')}
    ORDER BY q.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset) as any[];

  return {
    questions: rows.map((q) => ({
      id: q.id,
      course: q.course,
      subject: q.subject,
      chapter: q.chapter,
      topic: q.topic,
      questionType: q.question_type,
      caseId: q.case_id || undefined,
      caseSequence: q.case_sequence != null ? q.case_sequence : undefined,
      caseTitle: q.case_title || undefined,
      caseStudyScenario: q.case_study_scenario || q.parent_case_scenario || undefined,
      difficulty: q.difficulty,
      source: q.source,
      attempt: q.attempt,
      applicableFrom: q.applicable_from,
      applicableTill: q.applicable_till,
      amendmentVersion: q.amendment_version,
      questionText: q.question_text,
      optionA: q.option_a,
      optionB: q.option_b,
      optionC: q.option_c,
      optionD: q.option_d,
      correctAnswer: q.correct_answer,
      explanation: q.explanation,
      reference: q.reference,
      status: q.status,
      sourceMaterialId: q.source_material_id || undefined,
      createdBy: q.created_by,
      reviewedBy: q.reviewed_by,
      createdAt: q.created_at,
      updatedAt: q.updated_at,
    })),
    total: countRow.total,
    page,
    totalPages: Math.ceil(countRow.total / limit),
  };
}

export function validateQuestionForPublish(data: {
  correctAnswer?: string;
  explanation?: string;
}): { valid: boolean; error?: string } {
  if (!data.correctAnswer || !['A', 'B', 'C', 'D'].includes(data.correctAnswer.trim().toUpperCase())) {
    return {
      valid: false,
      error: 'Cannot publish question: correctAnswer must be strictly Option A, B, C, or D.',
    };
  }
  if (!data.explanation || !data.explanation.trim()) {
    return {
      valid: false,
      error: 'Cannot publish question: non-empty explanation is required for student learning.',
    };
  }
  return { valid: true };
}

export function createAdminQuestion(data: any, createdBy: string) {
  if (data.status === 'published') {
    const v = validateQuestionForPublish({
      correctAnswer: data.correctAnswer,
      explanation: data.explanation,
    });
    if (!v.valid) {
      throw new Error(v.error);
    }
  }

  const id = `mcq_${crypto.randomBytes(8).toString('hex')}`;
  db.prepare(`
    INSERT INTO mcq_questions (
      id, course, subject, chapter, topic, question_type, case_id, case_sequence, case_study_scenario,
      difficulty, source, attempt, applicable_from, applicable_till, amendment_version,
      question_text, option_a, option_b, option_c, option_d, correct_answer,
      explanation, reference, status, source_material_id, created_by, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
  `).run(
    id,
    data.course,
    data.subject,
    data.chapter,
    data.topic || null,
    data.questionType || (data.caseId ? 'case_based' : 'normal'),
    data.caseId || null,
    data.caseSequence != null ? Number(data.caseSequence) : null,
    data.caseStudyScenario || null,
    data.difficulty || 'moderate',
    data.source || 'ICAI Module',
    data.attempt || 'May 2026',
    data.applicableFrom || null,
    data.applicableTill || null,
    data.amendmentVersion || null,
    data.questionText,
    data.optionA,
    data.optionB,
    data.optionC,
    data.optionD,
    data.correctAnswer,
    data.explanation,
    data.reference || null,
    data.status || 'published',
    data.sourceMaterialId || data.source_material_id || null,
    createdBy
  );

  return db.prepare('SELECT * FROM mcq_questions WHERE id = ?').get(id);
}

export function updateAdminQuestion(id: string, data: any, reviewedBy?: string) {
  if (data.status === 'published') {
    const existing = db.prepare('SELECT * FROM mcq_questions WHERE id = ?').get(id) as any;
    const ans = data.correctAnswer !== undefined ? data.correctAnswer : existing?.correct_answer;
    const exp = data.explanation !== undefined ? data.explanation : existing?.explanation;
    const v = validateQuestionForPublish({ correctAnswer: ans, explanation: exp });
    if (!v.valid) {
      throw new Error(`Cannot publish question (${id}): ${v.error}`);
    }
  }

  db.prepare(`
    UPDATE mcq_questions
    SET course = COALESCE(?, course),
        subject = COALESCE(?, subject),
        chapter = COALESCE(?, chapter),
        topic = COALESCE(?, topic),
        question_type = COALESCE(?, question_type),
        case_id = COALESCE(?, case_id),
        case_sequence = COALESCE(?, case_sequence),
        case_study_scenario = COALESCE(?, case_study_scenario),
        difficulty = COALESCE(?, difficulty),
        source = COALESCE(?, source),
        attempt = COALESCE(?, attempt),
        applicable_from = COALESCE(?, applicable_from),
        applicable_till = COALESCE(?, applicable_till),
        amendment_version = COALESCE(?, amendment_version),
        question_text = COALESCE(?, question_text),
        option_a = COALESCE(?, option_a),
        option_b = COALESCE(?, option_b),
        option_c = COALESCE(?, option_c),
        option_d = COALESCE(?, option_d),
        correct_answer = COALESCE(?, correct_answer),
        explanation = COALESCE(?, explanation),
        reference = COALESCE(?, reference),
        status = COALESCE(?, status),
        source_material_id = COALESCE(?, source_material_id),
        reviewed_by = COALESCE(?, reviewed_by),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    data.course,
    data.subject,
    data.chapter,
    data.topic,
    data.questionType,
    data.caseId,
    data.caseSequence != null ? Number(data.caseSequence) : null,
    data.caseStudyScenario,
    data.difficulty,
    data.source,
    data.attempt,
    data.applicableFrom,
    data.applicableTill,
    data.amendmentVersion,
    data.questionText,
    data.optionA,
    data.optionB,
    data.optionC,
    data.optionD,
    data.correctAnswer,
    data.explanation,
    data.reference,
    data.status,
    data.sourceMaterialId || data.source_material_id,
    reviewedBy,
    id
  );

  return db.prepare('SELECT * FROM mcq_questions WHERE id = ?').get(id);
}

// ==========================================
// CASE BUNDLE SERVICES
// ==========================================
export function getAdminCases(filters: {
  course?: string;
  subject?: string;
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  const { course, subject, status, search, page = 1, limit = 20 } = filters;
  const conditions: string[] = ["status != 'DELETED'"];
  const params: any[] = [];

  if (course && course !== 'ALL') {
    conditions.push('course = ?');
    params.push(course);
  }
  if (subject && subject !== 'ALL') {
    conditions.push('subject = ?');
    params.push(subject);
  }
  if (status && status !== 'ALL') {
    conditions.push('status = ?');
    params.push(status);
  }
  if (search && search.trim()) {
    conditions.push('(case_title LIKE ? OR case_scenario LIKE ? OR case_id LIKE ?)');
    const term = `%${search.trim()}%`;
    params.push(term, term, term);
  }

  const offset = (page - 1) * limit;
  const countRow = db.prepare(`SELECT count(*) as total FROM mcq_cases WHERE ${conditions.join(' AND ')}`).get(...params) as { total: number };
  const cases = db.prepare(`
    SELECT * FROM mcq_cases
    WHERE ${conditions.join(' AND ')}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset) as any[];

  // Attach child questions to each case
  const casesWithQuestions = cases.map((c) => {
    const childQuestions = db.prepare(`
      SELECT * FROM mcq_questions
      WHERE case_id = ? AND status != 'DELETED'
      ORDER BY case_sequence ASC, created_at ASC
    `).all(c.case_id) as any[];

    return {
      caseId: c.case_id,
      caseTitle: c.case_title,
      caseScenario: c.case_scenario,
      caseDifficulty: c.case_difficulty,
      course: c.course,
      subject: c.subject,
      chapter: c.chapter,
      topic: c.topic,
      source: c.source,
      attempt: c.attempt,
      applicableFrom: c.applicable_from,
      applicableTill: c.applicable_till,
      amendmentVersion: c.amendment_version,
      status: c.status,
      createdBy: c.created_by,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
      childQuestions: childQuestions.map((q) => ({
        id: q.id,
        course: q.course,
        subject: q.subject,
        chapter: q.chapter,
        topic: q.topic,
        questionType: q.question_type,
        caseId: q.case_id,
        caseSequence: q.case_sequence,
        questionText: q.question_text,
        optionA: q.option_a,
        optionB: q.option_b,
        optionC: q.option_c,
        optionD: q.option_d,
        correctAnswer: q.correct_answer,
        explanation: q.explanation,
        reference: q.reference,
        status: q.status,
      })),
    };
  });

  return {
    cases: casesWithQuestions,
    total: countRow.total,
    page,
    totalPages: Math.ceil(countRow.total / limit),
  };
}

export function getAdminCaseById(caseId: string) {
  const c = db.prepare('SELECT * FROM mcq_cases WHERE case_id = ?').get(caseId) as any;
  if (!c) return null;

  const childQuestions = db.prepare(`
    SELECT * FROM mcq_questions
    WHERE case_id = ? AND status != 'DELETED'
    ORDER BY case_sequence ASC, created_at ASC
  `).all(caseId) as any[];

  return {
    caseId: c.case_id,
    caseTitle: c.case_title,
    caseScenario: c.case_scenario,
    caseDifficulty: c.case_difficulty,
    course: c.course,
    subject: c.subject,
    chapter: c.chapter,
    topic: c.topic,
    source: c.source,
    attempt: c.attempt,
    applicableFrom: c.applicable_from,
    applicableTill: c.applicable_till,
    amendmentVersion: c.amendment_version,
    status: c.status,
    createdBy: c.created_by,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
    childQuestions,
  };
}

export function bulkUpdateCaseStatus(caseIds: string[], status: string) {
  if (status === 'published') {
    for (const cid of caseIds) {
      const childQuestions = db.prepare('SELECT * FROM mcq_questions WHERE case_id = ? AND status != \'DELETED\'').all(cid) as any[];
      for (const q of childQuestions) {
        const v = validateQuestionForPublish({ correctAnswer: q.correct_answer, explanation: q.explanation });
        if (!v.valid) {
          throw new Error(`Cannot publish case (${cid}): Child question ${q.id} has error: ${v.error}`);
        }
      }
    }
  }

  const updateCase = db.prepare(`UPDATE mcq_cases SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE case_id = ?`);
  const updateQuestions = db.prepare(`UPDATE mcq_questions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE case_id = ?`);

  db.exec('BEGIN TRANSACTION');
  try {
    for (const cid of caseIds) {
      updateCase.run(status, cid);
      updateQuestions.run(status, cid);
    }
    db.exec('COMMIT');
    return { updatedCount: caseIds.length };
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function deleteAdminCase(caseId: string) {
  db.exec('BEGIN TRANSACTION');
  try {
    db.prepare(`UPDATE mcq_cases SET status = 'DELETED', updated_at = CURRENT_TIMESTAMP WHERE case_id = ?`).run(caseId);
    db.prepare(`UPDATE mcq_questions SET status = 'DELETED', updated_at = CURRENT_TIMESTAMP WHERE case_id = ?`).run(caseId);
    db.exec('COMMIT');
    return { success: true };
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function bulkUpdateQuestionStatus(ids: string[], status: McqStatus) {
  if (status === 'published') {
    for (const id of ids) {
      const q = db.prepare('SELECT * FROM mcq_questions WHERE id = ?').get(id) as any;
      if (!q) continue;
      const v = validateQuestionForPublish({ correctAnswer: q.correct_answer, explanation: q.explanation });
      if (!v.valid) {
        throw new Error(`Cannot publish question (${id}): ${v.error}`);
      }
    }
  }

  const update = db.prepare('UPDATE mcq_questions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
  for (const id of ids) {
    update.run(status, id);
  }
  return { updatedCount: ids.length };
}

export function deleteAdminQuestion(id: string) {
  try {
    db.prepare("UPDATE mcq_questions SET status = 'DELETED', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
    db.prepare('DELETE FROM mcq_questions WHERE id = ?').run(id);
  } catch (err) {
    console.warn('[McqService] Delete question warning:', err);
  }
  return { success: true };
}

export function getAdminStats(): McqAdminStats {
  const totalQuestions = (db.prepare("SELECT count(*) as count FROM mcq_questions WHERE status != 'DELETED'").get() as any)?.count || 0;
  const publishedCount = (db.prepare("SELECT count(*) as count FROM mcq_questions WHERE status = 'published'").get() as any)?.count || 0;
  const reviewCount = (db.prepare("SELECT count(*) as count FROM mcq_questions WHERE status = 'review'").get() as any)?.count || 0;
  const draftCount = (db.prepare("SELECT count(*) as count FROM mcq_questions WHERE status = 'draft'").get() as any)?.count || 0;
  const archivedCount = (db.prepare("SELECT count(*) as count FROM mcq_questions WHERE status = 'archived'").get() as any)?.count || 0;

  const foundationCount = (db.prepare("SELECT count(*) as count FROM mcq_questions WHERE course = 'CA_FOUNDATION' AND status != 'DELETED'").get() as any)?.count || 0;
  const interCount = (db.prepare("SELECT count(*) as count FROM mcq_questions WHERE course = 'CA_INTERMEDIATE' AND status != 'DELETED'").get() as any)?.count || 0;
  const finalCount = (db.prepare("SELECT count(*) as count FROM mcq_questions WHERE course = 'CA_FINAL' AND status != 'DELETED'").get() as any)?.count || 0;

  const normalCount = (db.prepare("SELECT count(*) as count FROM mcq_questions WHERE question_type = 'normal' AND status != 'DELETED'").get() as any)?.count || 0;
  const caseCount = (db.prepare("SELECT count(*) as count FROM mcq_questions WHERE question_type = 'case_based' AND status != 'DELETED'").get() as any)?.count || 0;

  const easyCount = (db.prepare("SELECT count(*) as count FROM mcq_questions WHERE difficulty = 'easy' AND status != 'DELETED'").get() as any)?.count || 0;
  const modCount = (db.prepare("SELECT count(*) as count FROM mcq_questions WHERE difficulty = 'moderate' AND status != 'DELETED'").get() as any)?.count || 0;
  const hardCount = (db.prepare("SELECT count(*) as count FROM mcq_questions WHERE difficulty = 'hard' AND status != 'DELETED'").get() as any)?.count || 0;

  const totalSessionsAttempted = (db.prepare('SELECT count(*) as count FROM mcq_sessions').get() as any)?.count || 0;

  return {
    totalQuestions,
    publishedCount,
    reviewCount,
    draftCount,
    archivedCount,
    byCourse: {
      CA_FOUNDATION: foundationCount,
      CA_INTERMEDIATE: interCount,
      CA_FINAL: finalCount,
    },
    byType: {
      normal: normalCount,
      case_based: caseCount,
    },
    byDifficulty: {
      easy: easyCount,
      moderate: modCount,
      hard: hardCount,
    },
    totalSessionsAttempted,
  };
}
