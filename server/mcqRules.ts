import { db } from './db.js';
import crypto from 'crypto';

export interface DbMcqScoringRule {
  id: string;
  course_level: string;
  paper_number: string;
  paper_name: string;
  attempt: string;
  syllabus_version: string;
  wrong_penalty: number;
  correct_score_rule: string;
  unattempted_score_rule: string;
  is_active: number;
  description?: string;
  created_at?: string;
  updated_at?: string;
}

export const OFFICIAL_ICAI_DEFAULT_RULES: Omit<DbMcqScoringRule, 'created_at' | 'updated_at'>[] = [
  {
    id: 'mcq_rule_found_paper_1',
    course_level: 'FOUNDATION',
    paper_number: 'Paper 1',
    paper_name: 'Accounting',
    attempt: 'ALL',
    syllabus_version: 'ALL',
    wrong_penalty: 0,
    correct_score_rule: 'FULL_MARKS',
    unattempted_score_rule: 'ZERO',
    is_active: 1,
    description: 'CA Foundation Paper 1 Accounting: Correct = full marks, Wrong = 0 marks, Unattempted = 0 marks',
  },
  {
    id: 'mcq_rule_found_paper_2',
    course_level: 'FOUNDATION',
    paper_number: 'Paper 2',
    paper_name: 'Business Laws',
    attempt: 'ALL',
    syllabus_version: 'ALL',
    wrong_penalty: 0,
    correct_score_rule: 'FULL_MARKS',
    unattempted_score_rule: 'ZERO',
    is_active: 1,
    description: 'CA Foundation Paper 2 Business Laws: Correct = full marks, Wrong = 0 marks, Unattempted = 0 marks',
  },
  {
    id: 'mcq_rule_found_paper_3',
    course_level: 'FOUNDATION',
    paper_number: 'Paper 3',
    paper_name: 'Quantitative Aptitude',
    attempt: 'ALL',
    syllabus_version: 'ALL',
    wrong_penalty: -0.25,
    correct_score_rule: 'FULL_MARKS',
    unattempted_score_rule: 'ZERO',
    is_active: 1,
    description: 'CA Foundation Paper 3 Quantitative Aptitude: Correct = full marks, Wrong = -0.25 marks, Unattempted = 0 marks',
  },
  {
    id: 'mcq_rule_found_paper_4',
    course_level: 'FOUNDATION',
    paper_number: 'Paper 4',
    paper_name: 'Business Economics',
    attempt: 'ALL',
    syllabus_version: 'ALL',
    wrong_penalty: -0.25,
    correct_score_rule: 'FULL_MARKS',
    unattempted_score_rule: 'ZERO',
    is_active: 1,
    description: 'CA Foundation Paper 4 Business Economics: Correct = full marks, Wrong = -0.25 marks, Unattempted = 0 marks',
  },
  {
    id: 'mcq_rule_inter_all',
    course_level: 'INTERMEDIATE',
    paper_number: 'ALL',
    paper_name: 'All Intermediate MCQ Papers',
    attempt: 'ALL',
    syllabus_version: 'ALL',
    wrong_penalty: 0,
    correct_score_rule: 'FULL_MARKS',
    unattempted_score_rule: 'ZERO',
    is_active: 1,
    description: 'CA Intermediate MCQs: Correct = full marks, Wrong = 0 marks, Unattempted = 0 marks',
  },
  {
    id: 'mcq_rule_final_all',
    course_level: 'FINAL',
    paper_number: 'ALL',
    paper_name: 'All Final MCQ Papers',
    attempt: 'ALL',
    syllabus_version: 'ALL',
    wrong_penalty: 0,
    correct_score_rule: 'FULL_MARKS',
    unattempted_score_rule: 'ZERO',
    is_active: 1,
    description: 'CA Final MCQs: Correct = full marks, Wrong = 0 marks, Unattempted = 0 marks',
  },
];

/**
 * Returns the standardized canonical paper name using the FULL official subject name.
 * Strictly avoids abbreviations like "QA" or "Eco".
 */
export function getCanonicalPaperName(level: string, subjectName: string, subjectKey?: string): string {
  const normLevel = (level || '').toUpperCase().trim();
  const lowerName = (subjectName || '').toLowerCase().trim();
  const lowerKey = (subjectKey || '').toLowerCase().trim();

  if (normLevel === 'FOUNDATION') {
    if (
      lowerName.includes('quantitative aptitude') ||
      lowerKey.includes('quantitative_aptitude') ||
      lowerKey === 'found_qa' ||
      lowerName.includes('quantitative') ||
      lowerName === 'qa'
    ) {
      return 'Quantitative Aptitude';
    }
    if (
      lowerName.includes('business economics') ||
      lowerKey.includes('business_economics') ||
      lowerKey === 'found_eco' ||
      lowerName.includes('economics') ||
      lowerName === 'eco'
    ) {
      return 'Business Economics';
    }
    if (
      lowerName.includes('accounting') ||
      lowerKey.includes('foundation_accounting') ||
      lowerKey === 'found_acc'
    ) {
      return 'Accounting';
    }
    if (
      lowerName.includes('business law') ||
      lowerKey.includes('foundation_business_law') ||
      lowerKey === 'found_law'
    ) {
      return 'Business Laws';
    }
  }

  // Intermediate & Final or other papers
  return subjectName.trim();
}

/**
 * Resolves the active MCQ scoring rule for a given level, subject, attempt, and syllabus.
 * If no matching active rule is found, returns null so caller can halt evaluation.
 * Enforces the strict safety condition: -0.25 penalty ONLY when Level=FOUNDATION and
 * Paper is either 'Quantitative Aptitude' or 'Business Economics'.
 */
export function getActiveMcqScoringRule(params: {
  level: string;
  subjectName: string;
  subjectKey?: string;
  attempt?: string;
  syllabusVersion?: string;
}): DbMcqScoringRule | null {
  const normLevel = (params.level || '').toUpperCase().trim();
  const canonicalName = getCanonicalPaperName(normLevel, params.subjectName, params.subjectKey);
  const attempt = (params.attempt || 'ALL').trim();
  const syllabus = (params.syllabusVersion || 'ALL').trim();

  // 1. Fetch active rules for this course level
  const rules = (db.prepare(`
    SELECT * FROM mcq_scoring_rules
    WHERE is_active = 1 AND course_level = ?
  `).all(normLevel) as unknown) as DbMcqScoringRule[];

  if (!rules || rules.length === 0) {
    return null;
  }

  // 2. Find exact paper match
  let matchedRule: DbMcqScoringRule | null = null;

  // Check specific paper name match first
  const paperMatches = rules.filter((r) => {
    const rPaperName = r.paper_name.toLowerCase().trim();
    const cName = canonicalName.toLowerCase().trim();
    return (
      rPaperName === cName ||
      rPaperName === `paper 1: ${cName}` ||
      rPaperName === `paper 2: ${cName}` ||
      rPaperName === `paper 3: ${cName}` ||
      rPaperName === `paper 4: ${cName}` ||
      rPaperName.includes(cName)
    );
  });

  if (paperMatches.length > 0) {
    // Rank by attempt & syllabus specificity
    paperMatches.sort((a, b) => {
      const aAttemptScore = a.attempt === attempt ? 2 : a.attempt === 'ALL' ? 1 : 0;
      const bAttemptScore = b.attempt === attempt ? 2 : b.attempt === 'ALL' ? 1 : 0;
      const aSyllabusScore = a.syllabus_version === syllabus ? 2 : a.syllabus_version === 'ALL' ? 1 : 0;
      const bSyllabusScore = b.syllabus_version === syllabus ? 2 : b.syllabus_version === 'ALL' ? 1 : 0;
      return (bAttemptScore + bSyllabusScore) - (aAttemptScore + aSyllabusScore);
    });
    matchedRule = { ...paperMatches[0] };
  } else if (normLevel === 'INTERMEDIATE' || normLevel === 'FINAL') {
    // Check level-wide fallback rule (e.g. 'All Intermediate MCQ Papers' or paper_number = 'ALL')
    const fallbackRule = rules.find(
      (r) =>
        r.paper_number === 'ALL' ||
        r.paper_name === 'All Intermediate MCQ Papers' ||
        r.paper_name === 'All Final MCQ Papers' ||
        r.paper_name === 'ALL_PAPERS'
    );
    if (fallbackRule) {
      matchedRule = { ...fallbackRule };
    }
  }

  if (!matchedRule) {
    return null;
  }

  // 3. STRICT SAFETY CONDITION:
  // -0.25 negative marking must be applied ONLY when BOTH conditions are true:
  // Condition 1: CA Level = FOUNDATION
  // AND
  // Condition 2: The selected paper/subject is exactly one of: 'Quantitative Aptitude' or 'Business Economics'
  if (matchedRule.wrong_penalty < 0) {
    const isFoundation = normLevel === 'FOUNDATION';
    const isFoundationQaOrEco =
      canonicalName === 'Quantitative Aptitude' || canonicalName === 'Business Economics';

    if (!isFoundation || !isFoundationQaOrEco) {
      console.warn(
        `[MCQ SCORING SAFETY VIOLATION] Negative marking (${matchedRule.wrong_penalty}) requested for non-eligible paper: Level=${normLevel}, Paper=${canonicalName}. Overriding wrong_penalty to 0.`
      );
      matchedRule.wrong_penalty = 0;
    }
  }

  return matchedRule;
}

/**
 * Retrieves all configured MCQ scoring rules from the database.
 */
export function getAllMcqRules(): DbMcqScoringRule[] {
  return (db.prepare(`
    SELECT * FROM mcq_scoring_rules
    ORDER BY 
      CASE course_level 
        WHEN 'FOUNDATION' THEN 1 
        WHEN 'INTERMEDIATE' THEN 2 
        WHEN 'FINAL' THEN 3 
        ELSE 4 
      END ASC,
      paper_number ASC,
      paper_name ASC
  `).all() as unknown) as DbMcqScoringRule[];
}

/**
 * Resets the MCQ scoring rules to the official ICAI default configuration.
 */
export function resetDefaultMcqRules(): void {
  db.exec('BEGIN TRANSACTION');
  try {
    db.prepare('DELETE FROM mcq_scoring_rules').run();
    const insertStmt = db.prepare(`
      INSERT INTO mcq_scoring_rules (
        id, course_level, paper_number, paper_name, attempt, syllabus_version,
        wrong_penalty, correct_score_rule, unattempted_score_rule, is_active, description,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

    for (const rule of OFFICIAL_ICAI_DEFAULT_RULES) {
      insertStmt.run(
        rule.id,
        rule.course_level,
        rule.paper_number,
        rule.paper_name,
        rule.attempt,
        rule.syllabus_version,
        rule.wrong_penalty,
        rule.correct_score_rule,
        rule.unattempted_score_rule,
        rule.is_active,
        rule.description
      );
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
