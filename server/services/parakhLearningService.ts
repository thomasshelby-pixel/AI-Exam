import { db } from '../db.js';
import { getAllFirestoreDocs, getFirestoreDoc, setFirestoreDoc } from './firestoreDbService.js';
import { syncRecordToFirestore } from './firestoreSyncService.js';

export const PARAKH_LEARNING_CONSENT_VERSION = '1.0';
const PARAKH_COLLECTION = 'parakh_learning_records';

export interface ParakhLearningOptInInput {
  evaluationId: string;
  studentId: string;
  level: string;
  subjectKey: string;
  subjectName: string;
  materialType: string;
  paper: string;
  attempt: string;
  checkingMode: string;
}

export interface ParakhLearningReviewInput {
  evaluationId: string;
  reviewerId: string;
  reviewAction: 'AFFIRMED_AS_IS' | 'AMENDED';
  totalMarks: number;
  maximumMarks: number;
  reviewedAt?: string;
}

let schemaReady = false;

/**
 * Stores only a consented pointer to an evaluation. The source answer sheet,
 * checked copy and report remain in the existing protected evaluation storage.
 * No training data is exported and no model is trained by this service.
 */
function ensureParakhLearningSchema(): void {
  if (schemaReady) return;

  db.exec(`
    CREATE TABLE IF NOT EXISTS parakh_learning_records (
      evaluation_id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      consent_version TEXT NOT NULL,
      consented_at TEXT NOT NULL,
      level TEXT NOT NULL,
      subject_key TEXT NOT NULL,
      subject_name TEXT NOT NULL,
      material_type TEXT,
      paper TEXT,
      attempt TEXT,
      checking_mode TEXT,
      status TEXT NOT NULL DEFAULT 'AWAITING_ADMIN_REVIEW'
        CHECK (status IN ('AWAITING_ADMIN_REVIEW', 'VERIFIED_CANDIDATE', 'WITHDRAWN')),
      reviewer_id TEXT,
      review_action TEXT,
      reviewed_total_marks REAL,
      reviewed_maximum_marks REAL,
      reviewed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (evaluation_id) REFERENCES evaluations(id) ON DELETE CASCADE,
      FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_parakh_learning_status
      ON parakh_learning_records(status, created_at);
    CREATE INDEX IF NOT EXISTS idx_parakh_learning_subject
      ON parakh_learning_records(level, subject_key, attempt);
    CREATE INDEX IF NOT EXISTS idx_parakh_learning_student
      ON parakh_learning_records(student_id);
  `);

  schemaReady = true;
}

async function mirrorRecord(record: Record<string, any>): Promise<void> {
  // Firestore is the shared source across app instances. A mirror failure must
  // never delay or fail a student's evaluation or an administrator's review.
  try {
    await syncRecordToFirestore(PARAKH_COLLECTION, String(record.evaluation_id), record);
  } catch (error) {
    console.warn('[PARAKH] Could not mirror learning consent record to Firestore:', error);
  }
}

/** Call only after the normal evaluation job has been accepted successfully. */
export async function recordParakhLearningOptIn(
  consented: boolean,
  input: ParakhLearningOptInInput,
): Promise<boolean> {
  if (consented !== true) return false;

  ensureParakhLearningSchema();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT OR IGNORE INTO parakh_learning_records (
      evaluation_id, student_id, consent_version, consented_at,
      level, subject_key, subject_name, material_type, paper, attempt,
      checking_mode, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'AWAITING_ADMIN_REVIEW', ?, ?)
  `).run(
    input.evaluationId,
    input.studentId,
    PARAKH_LEARNING_CONSENT_VERSION,
    now,
    input.level,
    input.subjectKey,
    input.subjectName,
    input.materialType || null,
    input.paper || null,
    input.attempt || null,
    input.checkingMode || 'standard',
    now,
    now,
  );

  const record = db.prepare(
    'SELECT * FROM parakh_learning_records WHERE evaluation_id = ?'
  ).get(input.evaluationId) as Record<string, any> | undefined;

  if (!record) return false;
  await mirrorRecord(record);
  return true;
}

/** Promote a consented record only after the admin review has been finalized. */
export async function markParakhEvaluationAdminReviewed(input: ParakhLearningReviewInput): Promise<boolean> {
  ensureParakhLearningSchema();
  const reviewedAt = input.reviewedAt || new Date().toISOString();

  // The evaluation finalization request can land on a different app instance
  // from the upload. Hydrate its consent pointer from shared Firestore first.
  let existing = db.prepare(
    'SELECT * FROM parakh_learning_records WHERE evaluation_id = ?'
  ).get(input.evaluationId) as Record<string, any> | undefined;

  if (!existing) {
    try {
      const cloudRecord = await getFirestoreDoc<Record<string, any>>(PARAKH_COLLECTION, input.evaluationId);
      if (cloudRecord?.student_id && cloudRecord?.consent_version) {
        db.prepare(`
          INSERT OR IGNORE INTO parakh_learning_records (
            evaluation_id, student_id, consent_version, consented_at,
            level, subject_key, subject_name, material_type, paper, attempt,
            checking_mode, status, reviewer_id, review_action,
            reviewed_total_marks, reviewed_maximum_marks, reviewed_at,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          input.evaluationId,
          cloudRecord.student_id,
          cloudRecord.consent_version,
          cloudRecord.consented_at || reviewedAt,
          cloudRecord.level || 'UNKNOWN',
          cloudRecord.subject_key || 'unknown',
          cloudRecord.subject_name || 'Unknown subject',
          cloudRecord.material_type || null,
          cloudRecord.paper || null,
          cloudRecord.attempt || null,
          cloudRecord.checking_mode || 'standard',
          cloudRecord.status || 'AWAITING_ADMIN_REVIEW',
          cloudRecord.reviewer_id || null,
          cloudRecord.review_action || null,
          cloudRecord.reviewed_total_marks ?? null,
          cloudRecord.reviewed_maximum_marks ?? null,
          cloudRecord.reviewed_at || null,
          cloudRecord.created_at || reviewedAt,
          cloudRecord.updated_at || reviewedAt,
        );
      }
    } catch (error) {
      console.warn('[PARAKH] Could not hydrate consent record from Firestore:', error);
    }
  }

  const result = db.prepare(`
    UPDATE parakh_learning_records
    SET status = 'VERIFIED_CANDIDATE',
        reviewer_id = ?,
        review_action = ?,
        reviewed_total_marks = ?,
        reviewed_maximum_marks = ?,
        reviewed_at = ?,
        updated_at = ?
    WHERE evaluation_id = ?
      AND status = 'AWAITING_ADMIN_REVIEW'
  `).run(
    input.reviewerId,
    input.reviewAction,
    Number(input.totalMarks),
    Number(input.maximumMarks),
    reviewedAt,
    reviewedAt,
    input.evaluationId,
  );

  if (Number(result.changes || 0) < 1) return false;

  const record = db.prepare(
    'SELECT * FROM parakh_learning_records WHERE evaluation_id = ?'
  ).get(input.evaluationId) as Record<string, any> | undefined;

  if (record) await mirrorRecord(record);
  return Boolean(record);
}

/**
 * Withdraws a student's earlier PARAKH opt-ins. Existing evaluation history is
 * untouched; withdrawn references are excluded from future candidate selection.
 */
export async function withdrawParakhLearningConsent(studentId: string): Promise<number> {
  ensureParakhLearningSchema();
  const normalizedStudentId = String(studentId || '').trim();
  if (!normalizedStudentId) return 0;

  const now = new Date().toISOString();
  const localRecords = db.prepare(
    "SELECT * FROM parakh_learning_records WHERE student_id = ? AND status != 'WITHDRAWN'"
  ).all(normalizedStudentId) as Array<Record<string, any>>;

  let cloudRecords: Array<Record<string, any>> = [];
  let cloudAvailable = false;
  try {
    cloudRecords = await getAllFirestoreDocs<Record<string, any>>(PARAKH_COLLECTION, { failOnError: true });
    cloudAvailable = true;
  } catch (error) {
    console.warn('[PARAKH] Could not load shared consent records during withdrawal:', error);
  }

  const candidates = new Map<string, Record<string, any>>();
  for (const record of [...cloudRecords, ...localRecords]) {
    if (String(record.student_id || '') !== normalizedStudentId) continue;
    if (String(record.status || '').toUpperCase() === 'WITHDRAWN') continue;
    candidates.set(String(record.evaluation_id || record.id || ''), record);
  }

  let withdrawnCount = 0;
  for (const [evaluationId, record] of candidates) {
    if (!evaluationId) continue;

    const updatedAt = now;
    db.prepare(`
      UPDATE parakh_learning_records
      SET status = 'WITHDRAWN', updated_at = ?
      WHERE evaluation_id = ? AND student_id = ?
    `).run(updatedAt, evaluationId, normalizedStudentId);

    const updatedRecord = {
      ...record,
      evaluation_id: evaluationId,
      status: 'WITHDRAWN',
      updated_at: updatedAt,
    };

    let mirrored = false;
    if (cloudAvailable) {
      try {
        mirrored = await setFirestoreDoc(PARAKH_COLLECTION, evaluationId, updatedRecord);
      } catch (error) {
        console.warn('[PARAKH] Could not persist consent withdrawal to Firestore:', error);
      }
    }
    if (!mirrored) {
      const localRecord = db.prepare(
        'SELECT * FROM parakh_learning_records WHERE evaluation_id = ?'
      ).get(evaluationId) as Record<string, any> | undefined;
      if (localRecord) await mirrorRecord(localRecord);
    }
    withdrawnCount += 1;
  }

  return withdrawnCount;
}

export async function getParakhLearningDashboardMetrics(): Promise<Record<string, any>> {
  ensureParakhLearningSchema();

  const localRecords = db.prepare(
    'SELECT * FROM parakh_learning_records ORDER BY created_at DESC'
  ).all() as Array<Record<string, any>>;

  let records = localRecords;
  let dataSource: 'FIRESTORE' | 'SQLITE_CACHE_FALLBACK' = 'SQLITE_CACHE_FALLBACK';

  try {
    const cloudRecords = await getAllFirestoreDocs<Record<string, any>>(
      PARAKH_COLLECTION,
      { failOnError: true },
    );
    // A just-created local record may still be waiting for its asynchronous
    // mirror. Prefer that cache until Firestore catches up.
    if (cloudRecords.length > 0 || localRecords.length === 0) {
      records = cloudRecords;
      dataSource = 'FIRESTORE';
    }
  } catch (error) {
    console.warn('[PARAKH] Firestore metrics unavailable; showing local cache:', error);
  }

  const countStatus = (status: string) => records.filter(
    (record) => String(record.status || '').toUpperCase() === status,
  ).length;

  const subjectMap = new Map<string, {
    level: string;
    subjectKey: string;
    subjectName: string;
    optedIn: number;
    verified: number;
    awaitingReview: number;
  }>();

  for (const record of records) {
    const level = String(record.level || 'UNKNOWN');
    const subjectKey = String(record.subject_key || 'unknown');
    const subjectName = String(record.subject_name || subjectKey);
    const key = level + ':' + subjectKey;
    const existing = subjectMap.get(key) || {
      level,
      subjectKey,
      subjectName,
      optedIn: 0,
      verified: 0,
      awaitingReview: 0,
    };
    existing.optedIn += 1;
    const status = String(record.status || '').toUpperCase();
    if (status === 'VERIFIED_CANDIDATE') existing.verified += 1;
    if (status === 'AWAITING_ADMIN_REVIEW') existing.awaitingReview += 1;
    subjectMap.set(key, existing);
  }

  const latestActivityAt = records
    .map((record) => String(record.reviewed_at || record.consented_at || record.updated_at || record.created_at || ''))
    .filter(Boolean)
    .sort()
    .reverse()[0] || null;

  return {
    engineName: 'PARAKH Learning Engine',
    trainingEnabled: false,
    supervisorEnabled: false,
    productionEvaluationImpact: false,
    totalOptIns: records.length,
    awaitingAdminReview: countStatus('AWAITING_ADMIN_REVIEW'),
    verifiedCandidates: countStatus('VERIFIED_CANDIDATE'),
    withdrawn: countStatus('WITHDRAWN'),
    benchmarkRuns: 0,
    trainingRuns: 0,
    latestActivityAt,
    dataSource,
    bySubject: Array.from(subjectMap.values()).sort(
      (a, b) => a.level.localeCompare(b.level) || a.subjectName.localeCompare(b.subjectName),
    ),
  };
}
