import { db } from '../db.js';

export type ParakhConversationLanguage = 'english' | 'hindi' | 'hinglish';
export type ParakhConversationCourse = 'CA_FOUNDATION' | 'CA_INTERMEDIATE' | 'CA_FINAL';

export interface ParakhConversationLearningSignalInput {
  message: string;
  course: string;
  subjects?: string[];
  intent?: string;
  language: ParakhConversationLanguage;
}

export interface ParakhConversationLearningSignal {
  day: string;
  course: ParakhConversationCourse;
  topicKey: string;
  intentKey: 'learning_difficulty' | 'concept_help' | 'revision' | 'exam_strategy' | 'study_plan' | 'general_study';
  language: ParakhConversationLanguage;
}

const ALLOWED_COURSES = new Set<ParakhConversationCourse>([
  'CA_FOUNDATION', 'CA_INTERMEDIATE', 'CA_FINAL',
]);

const TOPIC_PATTERNS: Array<[string, RegExp]> = [
  ['fm_ratio_analysis', /\b(ratio analysis|ratios?|current ratio|quick ratio|debt[- ]equity|profitability ratio|liquidity ratio|roce)\b/i],
  ['financial_management', /\b(financial management|\bfm\b|cost of capital|capital structure|leverage|working capital|dividend decision)\b/i],
  ['strategic_management', /\b(strategic management|\bsm\b|swot|porter|pestel|strategic intent|value chain)\b/i],
  ['gst', /\b(gst|goods and services tax|input tax credit|itc|place of supply|time of supply)\b/i],
  ['income_tax', /\b(income tax|direct tax|capital gains|house property|salary income|tds|tcs)\b/i],
  ['auditing', /\b(audit|auditing|auditor|audit evidence|audit report|sa 200|sa 500)\b/i],
  ['cost_accounting', /\b(costing|cost accounting|marginal costing|standard costing|cost sheet|budgetary control)\b/i],
  ['accounting', /\b(accounting|accounts|financial statements|amalgamation|consolidation|accounting standard)\b/i],
  ['law', /\b(corporate law|company law|business law|companies act|llp act|interpretation of statutes|general clauses act)\b/i],
  ['quantitative_aptitude', /\b(quantitative aptitude|business mathematics|statistics|logical reasoning)\b/i],
  ['economics', /\b(business economics|economics|demand and supply|elasticity|market structure)\b/i],
  ['exam_strategy', /\b(mock tests?|past papers?|previous years?|time management|answer presentation|exam strategy|paper attempts?)\b/i],
  ['study_planning', /\b(study plan|timetable|schedule|revision plan|roadmap|daily routine)\b/i],
];

function resolveTopicKey(message: string, subjects: string[]): string {
  for (const [key, pattern] of TOPIC_PATTERNS) {
    if (pattern.test(message)) return key;
  }
  const subject = subjects.join(' ').toLowerCase();
  if (/financial management/.test(subject)) return 'financial_management';
  if (/strategic management/.test(subject)) return 'strategic_management';
  if (/tax/.test(subject)) return 'income_tax';
  if (/audit/.test(subject)) return 'auditing';
  if (/cost/.test(subject)) return 'cost_accounting';
  if (/account/.test(subject)) return 'accounting';
  if (/law/.test(subject)) return 'law';
  if (/economics/.test(subject)) return 'economics';
  if (/quantitative/.test(subject)) return 'quantitative_aptitude';
  return 'general_ca_study';
}

/**
 * Converts a student turn into a small, controlled taxonomy signal.
 * The returned object deliberately has no message text, account identifier,
 * email, phone number, or conversation transcript.
 */
export function buildParakhConversationLearningSignal(
  input: ParakhConversationLearningSignalInput,
  now = new Date(),
): ParakhConversationLearningSignal | null {
  const course = String(input.course || '').toUpperCase() as ParakhConversationCourse;
  if (!ALLOWED_COURSES.has(course)) return null;

  const message = String(input.message || '').trim();
  if (!message) return null;

  const topicKey = resolveTopicKey(message, Array.isArray(input.subjects) ? input.subjects : []);
  const hasStudyContext = topicKey !== 'general_ca_study'
    || /\b(ca|icai|chapter|subject|concept|formula|numerical|revision|study|exam|paper|question|doubt|syllabus)\b/i.test(message)
    || /पढ़|अध्याय|परीक्षा|विषय|सवाल|समझ/i.test(message);
  if (!hasStudyContext) return null;

  const intentKey: ParakhConversationLearningSignal['intentKey'] =
    /\b(mujhe|i|i am|i'm)\b.{0,80}\b(nahi|nahin|nhi|don't|do not|can't|cannot|struggling|confused|difficult|hard)\b|\b(samajh nahi|samajh nahin|nahi aata|nahin aata)\b/i.test(message)
      ? 'learning_difficulty'
      : /\b(revision|revise|recall|remember|memorize|yaad|भूल|याद)\b/i.test(message)
        ? 'revision'
        : /\b(mock|past paper|previous year|time management|answer presentation|exam strategy)\b/i.test(message)
          ? 'exam_strategy'
          : /\b(study plan|timetable|schedule|roadmap|daily routine)\b/i.test(message)
            ? 'study_plan'
            : /\b(explain|what is|what are|how to|difference between|meaning|samjha|samjhao|batao|kya hai|kaise)\b/i.test(message)
              ? 'concept_help'
              : 'general_study';

  return {
    day: now.toISOString().slice(0, 10),
    course,
    topicKey,
    intentKey,
    language: input.language,
  };
}

let schemaReady = false;

function ensureSchema(): void {
  if (schemaReady) return;
  db.exec(String.raw`
    CREATE TABLE IF NOT EXISTS parakh_conversation_learning_signals (
      day TEXT NOT NULL,
      course TEXT NOT NULL,
      topic_key TEXT NOT NULL,
      intent_key TEXT NOT NULL,
      language TEXT NOT NULL,
      signal_count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (day, course, topic_key, intent_key, language)
    );
    CREATE INDEX IF NOT EXISTS idx_parakh_conversation_signals_day
      ON parakh_conversation_learning_signals(day);
  `);
  schemaReady = true;
}

export function recordParakhConversationLearningSignal(
  input: ParakhConversationLearningSignalInput,
): boolean {
  // Opt-in is disabled until the conversation-learning purpose has been reviewed
  // and the applicable notice/consent requirements have been satisfied.
  if (process.env.PARAKH_CONVERSATION_LEARNING_ENABLED !== 'true') return false;

  const signal = buildParakhConversationLearningSignal(input);
  if (!signal) return false;

  ensureSchema();
  const now = new Date().toISOString();
  db.prepare(String.raw`
    INSERT INTO parakh_conversation_learning_signals (
      day, course, topic_key, intent_key, language, signal_count, updated_at
    ) VALUES (?, ?, ?, ?, ?, 1, ?)
    ON CONFLICT(day, course, topic_key, intent_key, language)
    DO UPDATE SET signal_count = signal_count + 1, updated_at = excluded.updated_at
  `).run(signal.day, signal.course, signal.topicKey, signal.intentKey, signal.language, now);

  // Keep only aggregate signals for the previous 180 days.
  db.prepare("DELETE FROM parakh_conversation_learning_signals WHERE day < date('now', '-180 days')").run();
  return true;
}

/** Super-admin-facing aggregate only; never returns individual student or message data. */
export function getParakhConversationLearningMetrics(days = 30): Record<string, unknown> {
  ensureSchema();
  const safeDays = Math.max(1, Math.min(180, Math.floor(Number(days) || 30)));
  const rows = db.prepare(String.raw`
    SELECT topic_key, intent_key, language, SUM(signal_count) AS signal_count
    FROM parakh_conversation_learning_signals
    WHERE day >= date('now', ?)
    GROUP BY topic_key, intent_key, language
    ORDER BY signal_count DESC, topic_key ASC
  `).all('-' + safeDays + ' days') as Array<{
    topic_key: string; intent_key: string; language: string; signal_count: number;
  }>;

  return {
    enabled: process.env.PARAKH_CONVERSATION_LEARNING_ENABLED === 'true',
    windowDays: safeDays,
    totalSignals: rows.reduce((sum, row) => sum + Number(row.signal_count || 0), 0),
    byTopic: rows.map((row) => ({
      topic: row.topic_key,
      intent: row.intent_key,
      language: row.language,
      count: Number(row.signal_count || 0),
    })),
    dataMode: 'AGGREGATE_CATEGORIES_ONLY',
    automaticModelTraining: false,
  };
}
