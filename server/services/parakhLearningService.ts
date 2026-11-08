import { db } from '../db.js';
import { getAllFirestoreDocs, getFirestoreDoc, setFirestoreDoc } from './firestoreDbService.js';
import { syncRecordToFirestore } from './firestoreSyncService.js';

export const PARAKH_LEARNING_POLICY_VERSION = '3.0';
const PARAKH_COLLECTION = 'parakh_learning_records';

type ParakhRecordStatus =
  | 'PROCESSING'
  | 'COLLECTED_UNVERIFIED'
  | 'SELECTED_FOR_REVIEW'
  | 'VERIFIED_SAMPLE'
  | 'FAILED'
  | 'EXCLUDED';

export interface ParakhLearningObservationInput {
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

export interface ParakhLearningCompletionInput {
  evaluationId: string;
  evaluationStatus: 'COMPLETED' | 'NEEDS_REVIEW';
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

function ensureParakhLearningSchema(): void {
  if (schemaReady) return;

  db.exec(`
    CREATE TABLE IF NOT EXISTS parakh_learning_records (
      evaluation_id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      policy_version TEXT NOT NULL,
      recorded_at TEXT NOT NULL,
      level TEXT NOT NULL,
      subject_key TEXT NOT NULL,
      subject_name TEXT NOT NULL,
      material_type TEXT,
      paper TEXT,
      attempt TEXT,
      checking_mode TEXT,
      status TEXT NOT NULL DEFAULT 'PROCESSING'
        CHECK (status IN (
          'PROCESSING', 'COLLECTED_UNVERIFIED', 'SELECTED_FOR_REVIEW',
          'VERIFIED_SAMPLE', 'FAILED', 'EXCLUDED'
        )),
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

    CREATE TABLE IF NOT EXISTS parakh_learning_exclusions (
      student_id TEXT PRIMARY KEY,
      excluded_at TEXT NOT NULL
    );
  `);

  schemaReady = true;
}

/** Best-effort shared mirror; it must never interrupt evaluation or review. */
async function mirrorRecord(record: Record<string, any>): Promise<void> {
  try {
    await syncRecordToFirestore(PARAKH_COLLECTION, String(record.evaluation_id), record);
  } catch (error) {
    console.warn('[PARAKH] Could not mirror learning record to Firestore:', error);
  }
}

function getLocalRecord(evaluationId: string): Record<string, any> | undefined {
  return db.prepare(
    'SELECT * FROM parakh_learning_records WHERE evaluation_id = ?'
  ).get(evaluationId) as Record<string, any> | undefined;
}

/** Recover a policy-covered observation pointer when upload and evaluation workers use different instances. */
async function hydrateParakhRecordFromFirestore(evaluationId: string): Promise<Record<string, any> | undefined> {
  const local = getLocalRecord(evaluationId);
  if (local) return local;

  try {
    const cloudRecord = await getFirestoreDoc<Record<string, any>>(PARAKH_COLLECTION, evaluationId);
    if (!cloudRecord?.student_id || !cloudRecord?.policy_version) return undefined;

    db.prepare(`
      INSERT OR IGNORE INTO parakh_learning_records (
        evaluation_id, student_id, policy_version, recorded_at,
        level, subject_key, subject_name, material_type, paper, attempt,
        checking_mode, status, reviewer_id, review_action,
        reviewed_total_marks, reviewed_maximum_marks, reviewed_at,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      evaluationId,
      cloudRecord.student_id,
      cloudRecord.policy_version,
      cloudRecord.recorded_at || new Date().toISOString(),
      cloudRecord.level || 'UNKNOWN',
      cloudRecord.subject_key || 'unknown',
      cloudRecord.subject_name || 'Unknown subject',
      cloudRecord.material_type || null,
      cloudRecord.paper || null,
      cloudRecord.attempt || null,
      cloudRecord.checking_mode || 'standard',
      cloudRecord.status || 'PROCESSING',
      cloudRecord.reviewer_id || null,
      cloudRecord.review_action || null,
      cloudRecord.reviewed_total_marks ?? null,
      cloudRecord.reviewed_maximum_marks ?? null,
      cloudRecord.reviewed_at || null,
      cloudRecord.created_at || new Date().toISOString(),
      cloudRecord.updated_at || new Date().toISOString(),
    );
    return getLocalRecord(evaluationId);
  } catch (error) {
    console.warn('[PARAKH] Could not hydrate learning record from Firestore:', error);
    return undefined;
  }
}

/**
 * Stores a policy-covered observation pointer to the existing protected evaluation. It does not
 * duplicate student files or create a training dataset.
 *
 * The evaluation can finish very quickly (or on another worker) before this
 * write occurs, so its current status is checked to avoid a stuck PROCESSING row.
 */
export async function recordParakhLearningObservation(
  input: ParakhLearningObservationInput,
): Promise<boolean> {
  ensureParakhLearningSchema();
  const localExclusion = db.prepare('SELECT student_id FROM parakh_learning_exclusions WHERE student_id = ?').get(input.studentId);
  if (localExclusion) return false;
  try {
    const sharedExclusion = await getFirestoreDoc<{ student_id?: string; excluded_at?: string }>('parakh_learning_exclusions', input.studentId);
    if (sharedExclusion?.student_id) {
      db.prepare('INSERT OR IGNORE INTO parakh_learning_exclusions (student_id, excluded_at) VALUES (?, ?)')
        .run(input.studentId, sharedExclusion.excluded_at || new Date().toISOString());
      return false;
    }
  } catch (error) {
    // Fail closed: do not collect a new observation when a cross-instance exclusion
    // preference cannot be checked against the shared record.
    console.warn('[PARAKH] Could not verify shared exclusion preference; skipping observation:', error);
    return false;
  }
  const now = new Date().toISOString();
  const evaluation = db.prepare(
    'SELECT status FROM evaluations WHERE id = ?'
  ).get(input.evaluationId) as { status?: string } | undefined;
  let evaluationStatus = String(evaluation?.status || '').toUpperCase();
  if (!['COMPLETED', 'NEEDS_REVIEW', 'FAILED', 'REJECTED', 'PERSISTENCE_FAILED', 'CANCELLED'].includes(evaluationStatus)) {
    try {
      const sharedEvaluation = await getFirestoreDoc<{ status?: string }>('evaluations', input.evaluationId);
      const sharedStatus = String(sharedEvaluation?.status || '').toUpperCase();
      if (sharedStatus) evaluationStatus = sharedStatus;
    } catch (error) {
      console.warn('[PARAKH] Could not read shared evaluation status:', error);
    }
  }

  const initialStatus: ParakhRecordStatus =
    evaluationStatus === 'COMPLETED'
      ? 'COLLECTED_UNVERIFIED'
      : evaluationStatus === 'NEEDS_REVIEW'
        ? 'SELECTED_FOR_REVIEW'
        : ['FAILED', 'REJECTED', 'PERSISTENCE_FAILED', 'CANCELLED'].includes(evaluationStatus)
          ? 'FAILED'
          : 'PROCESSING';

  db.prepare(`
    INSERT OR IGNORE INTO parakh_learning_records (
      evaluation_id, student_id, policy_version, recorded_at,
      level, subject_key, subject_name, material_type, paper, attempt,
      checking_mode, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.evaluationId,
    input.studentId,
    PARAKH_LEARNING_POLICY_VERSION,
    now,
    input.level,
    input.subjectKey,
    input.subjectName,
    input.materialType || null,
    input.paper || null,
    input.attempt || null,
    input.checkingMode || 'standard',
    initialStatus,
    now,
    now,
  );

  const record = getLocalRecord(input.evaluationId);
  if (!record) return false;
  await mirrorRecord(record);
  return true;
}

/**
 * Called by the existing evaluator after a result has been durably finalized.
 * Normal completed evaluations become observations; integrity-flagged cases
 * are prioritized for the existing human review queue, not treated as labels.
 */
export async function markParakhEvaluationCompleted(
  input: ParakhLearningCompletionInput,
): Promise<boolean> {
  ensureParakhLearningSchema();
  const nextStatus: ParakhRecordStatus =
    input.evaluationStatus === 'NEEDS_REVIEW' ? 'SELECTED_FOR_REVIEW' : 'COLLECTED_UNVERIFIED';
  await hydrateParakhRecordFromFirestore(input.evaluationId);
  const now = new Date().toISOString();

  const result = db.prepare(`
    UPDATE parakh_learning_records
    SET status = ?, updated_at = ?
    WHERE evaluation_id = ? AND status = 'PROCESSING'
  `).run(nextStatus, now, input.evaluationId);

  if (Number(result.changes || 0) < 1) return false;
  const record = getLocalRecord(input.evaluationId);
  if (record) await mirrorRecord(record);
  return Boolean(record);
}

/** Failed/rejected submissions are not counted as completed learning observations. */
export async function markParakhEvaluationFailed(evaluationId: string): Promise<boolean> {
  ensureParakhLearningSchema();
  await hydrateParakhRecordFromFirestore(evaluationId);
  const now = new Date().toISOString();
  const result = db.prepare(`
    UPDATE parakh_learning_records
    SET status = 'FAILED', updated_at = ?
    WHERE evaluation_id = ? AND status = 'PROCESSING'
  `).run(now, evaluationId);

  if (Number(result.changes || 0) < 1) return false;
  const record = getLocalRecord(evaluationId);
  if (record) await mirrorRecord(record);
  return Boolean(record);
}

/** Promote only a selected/actually reviewed sample to a human-verified label. */
export async function markParakhEvaluationAdminReviewed(
  input: ParakhLearningReviewInput,
): Promise<boolean> {
  ensureParakhLearningSchema();
  const reviewedAt = input.reviewedAt || new Date().toISOString();

  // Finalization may run on another application instance; recover the policy-covered
  // observation pointer from shared Firestore before applying the reviewer label.
  let existing = await hydrateParakhRecordFromFirestore(input.evaluationId);
  if (existing && String(existing.status || '').toUpperCase() === 'PROCESSING') {
    const evaluation = db.prepare('SELECT status FROM evaluations WHERE id = ?').get(input.evaluationId) as { status?: string } | undefined;
    const status = String(evaluation?.status || '').toUpperCase();
    const promoted = status === 'NEEDS_REVIEW' ? 'SELECTED_FOR_REVIEW'
      : status === 'COMPLETED' ? 'COLLECTED_UNVERIFIED' : null;
    if (promoted) {
      const now = new Date().toISOString();
      db.prepare(`
        UPDATE parakh_learning_records SET status = ?, updated_at = ?
        WHERE evaluation_id = ? AND status = 'PROCESSING'
      `).run(promoted, now, input.evaluationId);
      existing = getLocalRecord(input.evaluationId);
    }
  }

  const result = db.prepare(`
    UPDATE parakh_learning_records
    SET status = 'VERIFIED_SAMPLE',
        reviewer_id = ?,
        review_action = ?,
        reviewed_total_marks = ?,
        reviewed_maximum_marks = ?,
        reviewed_at = ?,
        updated_at = ?
    WHERE evaluation_id = ?
      AND status IN ('COLLECTED_UNVERIFIED', 'SELECTED_FOR_REVIEW')
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
  const record = getLocalRecord(input.evaluationId);
  if (record) await mirrorRecord(record);
  return Boolean(record);
}

/** Excludes all previous observations and pauses future collection without touching evaluation history, marks or credits. */
export async function excludeParakhLearningForStudent(studentId: string): Promise<number> {
  ensureParakhLearningSchema();
  const normalizedStudentId = String(studentId || '').trim();
  if (!normalizedStudentId) return 0;

  const now = new Date().toISOString();
  const exclusionRecord = { student_id: normalizedStudentId, excluded_at: now };

  // Persist the local stop immediately so this instance cannot collect more records.
  db.prepare('INSERT OR IGNORE INTO parakh_learning_exclusions (student_id, excluded_at) VALUES (?, ?)')
    .run(normalizedStudentId, now);

  // The preference must also be durable in shared storage. A false return is
  // not success: another application instance would otherwise continue collecting.
  let exclusionSynced = false;
  try {
    exclusionSynced = await setFirestoreDoc('parakh_learning_exclusions', normalizedStudentId, exclusionRecord);
  } catch (error) {
    console.warn('[PARAKH] Could not mirror learning exclusion preference:', error);
  }
  if (!exclusionSynced) {
    throw new Error('Your exclusion is active on this server, but we could not verify it across app servers. Please retry so we can confirm the shared preference.');
  }

  const localRecords = db.prepare(
    "SELECT * FROM parakh_learning_records WHERE student_id = ? AND status != 'EXCLUDED'"
  ).all(normalizedStudentId) as Array<Record<string, any>>;

  let cloudRecords: Array<Record<string, any>>;
  try {
    cloudRecords = await getAllFirestoreDocs<Record<string, any>>(PARAKH_COLLECTION, { failOnError: true });
  } catch (error) {
    console.warn('[PARAKH] Could not load shared learning records during exclusion:', error);
    throw new Error('Future PARAKH collection is paused, but we could not verify all previous observations. Please retry to finish excluding previous records.');
  }

  const candidates = new Map<string, Record<string, any>>();
  for (const record of [...cloudRecords, ...localRecords]) {
    if (String(record.student_id || '') !== normalizedStudentId) continue;
    if (String(record.status || '').toUpperCase() === 'EXCLUDED') continue;
    const id = String(record.evaluation_id || record.id || '');
    if (id) candidates.set(id, record);
  }

  let excludedCount = 0;
  for (const [evaluationId, record] of candidates) {
    const updatedRecord = {
      ...record,
      evaluation_id: evaluationId,
      status: 'EXCLUDED',
      updated_at: now,
    };
    const saved = await setFirestoreDoc(PARAKH_COLLECTION, evaluationId, updatedRecord);
    if (!saved) {
      throw new Error('Future PARAKH collection is paused, but at least one previous observation could not be updated. Please retry to finish excluding previous records.');
    }

    db.prepare(`
      UPDATE parakh_learning_records
      SET status = 'EXCLUDED', updated_at = ?
      WHERE evaluation_id = ? AND student_id = ?
    `).run(now, evaluationId, normalizedStudentId);
    excludedCount += 1;
  }

  return excludedCount;
}

export async function getParakhLearningDashboardMetrics(): Promise<Record<string, any>> {
  ensureParakhLearningSchema();

  const localRecords = db.prepare(
    'SELECT * FROM parakh_learning_records ORDER BY created_at DESC'
  ).all() as Array<Record<string, any>>;

  let records = localRecords;
  let dataSource = 'SQLITE_CACHE_FALLBACK';

  try {
    const cloudRecords = await getAllFirestoreDocs<Record<string, any>>(
      PARAKH_COLLECTION,
      { failOnError: true },
    );
    const merged = new Map<string, Record<string, any>>();
    for (const record of cloudRecords) {
      merged.set(String(record.evaluation_id || record.id), record);
    }
    for (const record of localRecords) {
      const id = String(record.evaluation_id || record.id);
      if (!id) continue;
      const existing = merged.get(id);
      const existingTime = new Date(existing?.updated_at || existing?._updatedAt || 0).getTime();
      const localTime = new Date(record.updated_at || 0).getTime();
      if (!existing || localTime > existingTime) merged.set(id, record);
    }
    records = Array.from(merged.values());
    dataSource = 'FIRESTORE + LOCAL CACHE';
  } catch (error) {
    console.warn('[PARAKH] Firestore metrics unavailable; showing local cache:', error);
  }

  const countStatus = (status: ParakhRecordStatus) => records.filter(
    (record) => String(record.status || '').toUpperCase() === status,
  ).length;

  const collectedStatuses = ['COLLECTED_UNVERIFIED', 'SELECTED_FOR_REVIEW', 'VERIFIED_SAMPLE'];
  const totalCollected = records.filter(
    (record) => collectedStatuses.includes(String(record.status || '').toUpperCase()),
  ).length;

  const subjectMap = new Map<string, {
    level: string;
    subjectKey: string;
    subjectName: string;
    optedIn: number;
    collected: number;
    unreviewed: number;
    selectedForReview: number;
    verified: number;
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
      collected: 0,
      unreviewed: 0,
      selectedForReview: 0,
      verified: 0,
    };
    existing.optedIn += 1;
    const status = String(record.status || '').toUpperCase();
    if (collectedStatuses.includes(status)) existing.collected += 1;
    if (status === 'COLLECTED_UNVERIFIED') existing.unreviewed += 1;
    if (status === 'SELECTED_FOR_REVIEW') existing.selectedForReview += 1;
    if (status === 'VERIFIED_SAMPLE') existing.verified += 1;
    subjectMap.set(key, existing);
  }

  const latestActivityAt = records
    .map((record) => String(record.reviewed_at || record.recorded_at || record.updated_at || record.created_at || ''))
    .filter(Boolean)
    .sort()
    .reverse()[0] || null;

  return {
    engineName: 'PARAKH Learning Engine',
    trainingEnabled: false,
    supervisorEnabled: false,
    productionEvaluationImpact: false,
    totalOptIns: records.length,
    totalCollected,
    processing: countStatus('PROCESSING'),
    unreviewedObservations: countStatus('COLLECTED_UNVERIFIED'),
    selectedForReview: countStatus('SELECTED_FOR_REVIEW'),
    verifiedSamples: countStatus('VERIFIED_SAMPLE'),
    failed: countStatus('FAILED'),
    excluded: countStatus('EXCLUDED'),
    benchmarkRuns: 0,
    trainingRuns: 0,
    latestActivityAt,
    dataSource,
    bySubject: Array.from(subjectMap.values()).sort(
      (a, b) => a.level.localeCompare(b.level) || a.subjectName.localeCompare(b.subjectName),
    ),
  };
}
