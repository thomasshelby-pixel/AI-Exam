import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { db, persistEvaluationRunPackageAtomic } from '../db.js';
import { evaluateCAAnswerSheet } from '../gemini.js';
import { CALevel, MaterialType, CheckingMode, EvaluationResult } from '../../src/types/index.js';
import {
  countCompletedQuestionEvaluations,
  generateCheckedCopyPdf,
  generateDetailedReportPdf,
  buildStructuredAnnotations,
} from './pdfCheckedCopyService.js';
import {
  refundEvaluationCreditAtomic,
  syncStudentCreditsToFirestore,
} from './studentCreditService.js';
import { settlePersonalEntitlementForSuccessfulEvaluation } from './evaluationEntitlementSettlementService.js';
import { savePersistentFile, getPersistentFile } from './persistentStorageService.js';
import { syncRecordToFirestore } from './firestoreSyncService.js';
import { getFirestoreDoc, queryFirestoreDocs, runFirestoreTransaction } from './firestoreDbService.js';
import { restoreDurableEvaluationJobPayload, serializeDurableEvaluationJobPayload } from './durableEvaluationJobPayload.js';
import { releaseFacultyMockFreeCopy, releaseFacultyMockPaidCopy } from './facultyMockEntitlementService.js';
import { validateAuthoritativeConsistency } from './evaluationIntegrityEngine.js';
import { isEvaluationValidationSafeForCertification } from './evaluationIntegrityHardening.js';
import { finalizeEvaluationRun } from './canonicalQuestionInventoryService.js';
import { validateQuestionDeduplication, deduplicateQuestionList } from './canonicalQuestionService.js';
import type { QuestionReferenceLockMetadata, ReferenceSourceType } from './questionReferenceLock.js';
import { getAuthoritativePaperStructure } from './paperStructureService.js';
import { getMaxModelTestNumberForLevel } from './modelTestLimits.js';
import { resolveMaterialComponentSourceIds, resolveFacultyMockComponentSourceIds } from './materialComponentSourceIds.js';
import { markParakhEvaluationCompleted, markParakhEvaluationFailed } from './parakhLearningService.js';
import {
  EvaluationEvidencePackage,
  enforceEvaluationEvidencePackageMtpGate,
  detectMtpSeriesFromText,
  normalizeAndSplitCombinedPyq,
  resolveOfficialPaperMaximumMarks,
} from './materialHardGateService.js';

export interface EvaluationJobData {
  evaluationId: string;
  studentId: string;
  studentName: string;
  icaiRegistrationNumber: string;
  level: CALevel;
  materialType: MaterialType;
  mtpSeries?: 1 | 2;
  modelTestNumber?: number;
  facultyMockTestId?: string;
  modelGroup?: string;
  subjectKey: string;
  subjectName: string;
  paper?: string;
  attempt?: string;
  syllabusVersion?: string;
  checkingMode: CheckingMode;
  fileBase64: string;
  mimeType: string;
  filename: string;
  pdfBuf: Buffer;
  referenceQuestionPaperText: string;
  referenceSuggestedAnswersText: string;
  markingSchemeText: string;
  referenceMaterialTitle?: string;
  referenceMaterialVersion?: string;
  referenceMaterialId?: string;
  officialPaperMaxMarks?: number;
  sourceFormat?: 'SEPARATE' | 'COMBINED' | 'LEGACY';
  combinedSourceMaterialId?: string;
  questionMaterialId?: string;
  suggestedAnswerMaterialId?: string;
  markingSchemeMaterialId?: string;
  entitlementSource: 'INSTITUTE_ALLOCATION' | 'PERMANENT_FREE' | 'PROMO' | 'PERSONAL_FREE' | 'PERSONAL_PURCHASED_CREDIT' | 'FACULTY_MOCK_SPONSORED';
  resolvedSponsoringInstituteId?: string | null;
  resolvedSponsoringEnrollmentId?: string | null;
  resolvedSponsoringBatchId?: string | null;
  resolvedInstituteName?: string | null;
  requestedEvalSource: 'PUBLIC' | 'INSTITUTE' | 'FACULTY_MOCK';
  personalEntitlement?: any;
  creditAlreadyConsumed?: boolean;
  /** Retry of an existing evaluation: do not consume or refund its original entitlement again. */
  isRecoveryRetry?: boolean;
  /** True only when the original PDF has been verified in Cloud Storage. */
  originalFileStorageConfirmed?: boolean;
}

// Run a bounded supervisor pass by default. Clean papers incur no extra model calls;
// only repairable question-level issues use at most four targeted correction calls.
// Operators can explicitly disable the second pass with EVALUATION_SUPERVISOR_ENABLED=false.
const ENABLE_EVALUATION_SUPERVISOR = process.env.EVALUATION_SUPERVISOR_ENABLED !== 'false';

// In-memory active job tracker to prevent duplicate concurrent runs for the same evaluationId.
const activeJobs = new Map<string, Promise<void>>();
const durableQueueStartingJobs = new Set<string>();
const DURABLE_QUEUE_COLLECTION = 'evaluation_jobs';
const DURABLE_QUEUE_LEASE_MS = 3 * 60 * 1000;
const DURABLE_QUEUE_HEARTBEAT_MS = 30 * 1000;
const DURABLE_QUEUE_POLL_MS = 30 * 1000;
const DURABLE_QUEUE_MAX_ATTEMPTS = 2;
const DURABLE_QUEUE_MAX_ACTIVE_JOBS = 1;
const DURABLE_QUEUE_INSTANCE_ID = [
  process.env.K_REVISION || 'app-hosting',
  process.pid,
  crypto.randomUUID(),
].join(':');
let durableQueueRecoveryTimer: NodeJS.Timeout | null = null;
const durableQueueNudgeTimes = new Map<string, number>();

type DurableEvaluationQueueRecord = {
  evaluationId: string;
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'COMPLETED_WITH_REVIEW' | 'FAILED';
  payload: Record<string, any>;
  originalFileId: string;
  sourceUploadFileId?: string | null;
  attempts: number;
  leaseOwner?: string | null;
  leaseExpiresAt?: string | null;
  nextAttemptAt?: string | null;
  createdAt: string;
  updatedAt: string;
  lastError?: string | null;
};

function isProductionEvaluationQueue(): boolean {
  return process.env.NODE_ENV === 'production' || Boolean(process.env.K_SERVICE || process.env.K_REVISION);
}

function isDurableQueueTerminal(status: unknown): boolean {
  return ['COMPLETED', 'COMPLETED_WITH_REVIEW', 'FAILED'].includes(String(status || '').toUpperCase());
}

function getEvaluationQueueTerminalStatus(evaluationStatus: string): DurableEvaluationQueueRecord['status'] | null {
  const status = String(evaluationStatus || '').toUpperCase();
  if (status === 'COMPLETED') return 'COMPLETED';
  if (status === 'NEEDS_REVIEW') return 'COMPLETED_WITH_REVIEW';
  if (['FAILED', 'REJECTED', 'PERSISTENCE_FAILED', 'CANCELLED'].includes(status)) return 'FAILED';
  return null;
}

function getSafeJsonPayload(job: EvaluationJobData): Record<string, any> {
  return serializeDurableEvaluationJobPayload(job as any);
}

async function ensureDurableOriginalFiles(job: EvaluationJobData): Promise<string | null> {
  if (job.pdfBuf.length === 0) {
    throw new Error('EVALUATION_ORIGINAL_FILE_EMPTY: The uploaded answer sheet is empty.');
  }

  if (!job.originalFileStorageConfirmed) {
    const storedPdf = await savePersistentFile(
      `${job.evaluationId}_original`,
      `${job.evaluationId}_original.pdf`,
      'application/pdf',
      job.pdfBuf,
      'EVALUATION_ORIGINAL',
      { ownerUserId: job.studentId, evaluationId: job.evaluationId },
    );
    if (storedPdf.status !== 'ACTIVE') {
      throw new Error('EVALUATION_ORIGINAL_FILE_NOT_DURABLE: The answer sheet could not be verified in Cloud Storage. The evaluation was not queued and no result will be produced.');
    }
  }

  // When an image was converted to PDF for checked-copy generation, preserve
  // the exact original image separately so a restarted worker uses the same input.
  const sourceBuffer = Buffer.from(job.fileBase64 || '', 'base64');
  if (sourceBuffer.length > 0 && !sourceBuffer.equals(job.pdfBuf)) {
    const sourceUploadFileId = `${job.evaluationId}_source_upload`;
    const storedSource = await savePersistentFile(
      sourceUploadFileId,
      job.filename || `${sourceUploadFileId}.bin`,
      job.mimeType || 'application/octet-stream',
      sourceBuffer,
      'EVALUATION_ORIGINAL',
      { ownerUserId: job.studentId, evaluationId: job.evaluationId },
    );
    if (storedSource.status !== 'ACTIVE') {
      throw new Error('EVALUATION_SOURCE_UPLOAD_NOT_DURABLE: The original uploaded image could not be verified in Cloud Storage.');
    }
    return sourceUploadFileId;
  }
  return null;
}

async function persistDurableEvaluationQueueRecord(
  job: EvaluationJobData,
  sourceUploadFileId: string | null,
): Promise<boolean> {
  const now = new Date().toISOString();
  const record: DurableEvaluationQueueRecord = {
    evaluationId: job.evaluationId,
    status: 'QUEUED',
    payload: getSafeJsonPayload(job),
    originalFileId: `${job.evaluationId}_original`,
    sourceUploadFileId,
    attempts: 0,
    leaseOwner: null,
    leaseExpiresAt: null,
    nextAttemptAt: null,
    createdAt: now,
    updatedAt: now,
    lastError: null,
  };

  const persisted = await runFirestoreTransaction(async (transaction) => {
    const existingSnapshot = await transaction.get(DURABLE_QUEUE_COLLECTION, job.evaluationId);
    const existing = existingSnapshot.data() || {};
    if (existingSnapshot.exists) {
      const existingStatus = String(existing.status || '').toUpperCase();
      const leaseUntil = Date.parse(String(existing.leaseExpiresAt || ''));
      const leaseIsLive = existingStatus === 'RUNNING' && Number.isFinite(leaseUntil) && leaseUntil > Date.now();
      if (
        ['QUEUED', 'RUNNING'].includes(existingStatus) &&
        (existingStatus === 'QUEUED' || leaseIsLive)
      ) {
        return false;
      }
    }
    transaction.set(DURABLE_QUEUE_COLLECTION, job.evaluationId, record as any);
    return true;
  });

  if (persisted === true) return true;
  if (persisted === false) {
    // A false result means a duplicate active job only after confirming the
    // authoritative document. A transaction timeout also returns a falsey
    // fallback in the Firestore adapter and must never be acknowledged as queued.
    const existing = await getFirestoreDoc<DurableEvaluationQueueRecord>(
      DURABLE_QUEUE_COLLECTION,
      job.evaluationId,
      { failOnError: true },
    );
    const status = String(existing?.status || '').toUpperCase();
    const leaseUntil = Date.parse(String(existing?.leaseExpiresAt || ''));
    if (status === 'QUEUED' || (status === 'RUNNING' && Number.isFinite(leaseUntil) && leaseUntil > Date.now())) {
      return false;
    }
  }

  throw new Error('EVALUATION_QUEUE_PERSISTENCE_UNCONFIRMED: Firestore did not confirm that the durable evaluation job was saved. Please retry; the evaluation has not been started.');
}

async function claimDurableEvaluationQueueRecord(evaluationId: string): Promise<DurableEvaluationQueueRecord | null> {
  let claimed: DurableEvaluationQueueRecord | null = null;
  await runFirestoreTransaction(async (transaction) => {
    const snapshot = await transaction.get(DURABLE_QUEUE_COLLECTION, evaluationId);
    if (!snapshot.exists) return;
    const current = (snapshot.data() || {}) as any;
    if (isDurableQueueTerminal(current.status)) return;

    const currentStatus = String(current.status || '').toUpperCase();
    const leaseUntil = Date.parse(String(current.leaseExpiresAt || ''));
    if (currentStatus === 'RUNNING' && Number.isFinite(leaseUntil) && leaseUntil > Date.now()) return;

    const now = new Date();
    const updated: DurableEvaluationQueueRecord = {
      ...current,
      evaluationId,
      status: 'RUNNING',
      attempts: Number(current.attempts || 0) + 1,
      leaseOwner: DURABLE_QUEUE_INSTANCE_ID,
      leaseExpiresAt: new Date(now.getTime() + DURABLE_QUEUE_LEASE_MS).toISOString(),
      nextAttemptAt: null,
      updatedAt: now.toISOString(),
    };
    transaction.set(DURABLE_QUEUE_COLLECTION, evaluationId, updated as any);
    claimed = updated;
  });
  return claimed;
}

async function updateDurableEvaluationQueueRecord(
  evaluationId: string,
  patch: Partial<DurableEvaluationQueueRecord>,
  requireCurrentLease = true,
): Promise<boolean> {
  return await runFirestoreTransaction(async (transaction) => {
    const snapshot = await transaction.get(DURABLE_QUEUE_COLLECTION, evaluationId);
    if (!snapshot.exists) return false;
    const current = (snapshot.data() || {}) as any;
    if (requireCurrentLease && current.leaseOwner !== DURABLE_QUEUE_INSTANCE_ID) return false;
    transaction.set(DURABLE_QUEUE_COLLECTION, evaluationId, {
      ...patch,
      updatedAt: new Date().toISOString(),
    } as any);
    return true;
  });
}

async function renewDurableEvaluationQueueLease(evaluationId: string): Promise<void> {
  try {
    await updateDurableEvaluationQueueRecord(evaluationId, {
      status: 'RUNNING',
      leaseExpiresAt: new Date(Date.now() + DURABLE_QUEUE_LEASE_MS).toISOString(),
    });
  } catch (error) {
    console.warn(`[DurableEvalQueue] Could not renew worker lease for ${evaluationId}:`, error);
  }
}

async function finishDurableEvaluationQueueRecord(
  evaluationId: string,
  status: DurableEvaluationQueueRecord['status'],
  lastError?: string,
): Promise<void> {
  await updateDurableEvaluationQueueRecord(evaluationId, {
    status,
    // The job snapshot is no longer needed once its evaluation reaches a
    // terminal state. Drop large QP/SA/MS text from Firestore to control storage.
    payload: {},
    sourceUploadFileId: null,
    leaseOwner: null,
    leaseExpiresAt: null,
    nextAttemptAt: null,
    lastError: lastError || null,
  });
}

async function requeueDurableEvaluation(
  evaluationId: string,
  lastError: string,
): Promise<void> {
  await updateDurableEvaluationQueueRecord(evaluationId, {
    status: 'QUEUED',
    leaseOwner: null,
    leaseExpiresAt: null,
    nextAttemptAt: new Date(Date.now() + 10_000).toISOString(),
    lastError: lastError.slice(0, 500),
  });
}

async function failDurableEvaluationBeforeExecution(job: Record<string, any>, reason: string): Promise<void> {
  const evaluationId = String(job.evaluationId || '');
  if (!evaluationId) return;
  const result = db.prepare(`
    UPDATE evaluations
    SET status = 'FAILED',
        error_message = ?,
        progress_stage = 'FAILED',
        progress_percentage = 100,
        progress_message = 'Evaluation worker could not resume the stored answer sheet.',
        completed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
      AND UPPER(COALESCE(status, '')) NOT IN ('COMPLETED', 'NEEDS_REVIEW', 'REJECTED', 'FAILED', 'PERSISTENCE_FAILED', 'CANCELLED')
  `).run(reason.slice(0, 500), evaluationId);

  if (result.changes === 1 && job.creditAlreadyConsumed && !job.isRecoveryRetry &&
    ['PROMO', 'PERSONAL_FREE', 'PERSONAL_PURCHASED_CREDIT'].includes(String(job.entitlementSource || '').toUpperCase())) {
    try {
      const restored = refundEvaluationCreditAtomic({
        userId: String(job.studentId),
        evaluationId,
        entitlementSource: String(job.entitlementSource).toUpperCase() as any,
      });
      if (restored) {
        db.prepare('UPDATE evaluations SET consumed_from_personal_credits = 0 WHERE id = ?').run(evaluationId);
        await syncStudentCreditsToFirestore(String(job.studentId));
      }
    } catch (refundError) {
      console.error(`[DurableEvalQueue] Could not refund unresumable evaluation ${evaluationId}:`, refundError);
    }
  }

  const failedRow = db.prepare('SELECT * FROM evaluations WHERE id = ?').get(evaluationId) as any;
  if (failedRow) {
    await syncRecordToFirestore('evaluations', evaluationId, failedRow).catch((error) =>
      console.warn(`[DurableEvalQueue] Failed to sync terminal evaluation ${evaluationId}:`, error)
    );
  }
}

async function hydrateDurableEvaluationJob(record: DurableEvaluationQueueRecord): Promise<EvaluationJobData> {
  const original = await getPersistentFile(record.originalFileId, `${record.evaluationId}_original.pdf`);
  if (!original?.buffer?.length) {
    throw new Error('EVALUATION_ORIGINAL_FILE_MISSING: The answer-sheet PDF is not available in durable Cloud Storage.');
  }

  let originalUploadBuffer: Buffer | null = null;
  if (record.sourceUploadFileId) {
    const source = await getPersistentFile(record.sourceUploadFileId, `${record.sourceUploadFileId}.pdf`);
    if (!source?.buffer?.length) {
      throw new Error('EVALUATION_SOURCE_UPLOAD_MISSING: The original uploaded image is not available in durable Cloud Storage.');
    }
    originalUploadBuffer = source.buffer;
  }
  const binary = restoreDurableEvaluationJobPayload(record.payload || {}, original.buffer, originalUploadBuffer);

  return {
    ...(record.payload as any),
    evaluationId: record.evaluationId,
    ...binary,
    filename: String(record.payload.filename || `${record.evaluationId}_original.pdf`),
    originalFileStorageConfirmed: true,
  } as EvaluationJobData;
}

async function runDurableEvaluationQueueRecord(
  evaluationId: string,
  initialJob?: EvaluationJobData,
): Promise<void> {
  if (activeJobs.has(evaluationId) || durableQueueStartingJobs.has(evaluationId)) return;
  durableQueueStartingJobs.add(evaluationId);
  try {
    const claimed = await claimDurableEvaluationQueueRecord(evaluationId);
    if (!claimed) return;

    const attempts = Number(claimed.attempts || 1);
    if (attempts > DURABLE_QUEUE_MAX_ATTEMPTS) {
      const payload = claimed.payload || {};
      await failDurableEvaluationBeforeExecution(payload, 'Evaluation worker could not resume this job after repeated instance interruptions. Your evaluation credit has been restored where applicable.');
      await finishDurableEvaluationQueueRecord(evaluationId, 'FAILED', 'Durable worker retry limit reached.');
      return;
    }

    const workerPromise = (async () => {
      const heartbeat = setInterval(() => {
        void renewDurableEvaluationQueueLease(evaluationId);
      }, DURABLE_QUEUE_HEARTBEAT_MS);
      heartbeat.unref?.();

      try {
        const currentStatus = getEvaluationStatus(evaluationId);
        const alreadyTerminal = getEvaluationQueueTerminalStatus(currentStatus);
        if (alreadyTerminal) {
          await finishDurableEvaluationQueueRecord(evaluationId, alreadyTerminal);
          return;
        }

        const job = initialJob || await hydrateDurableEvaluationJob(claimed);
        await executeEvaluationJob(job);

        const finalStatus = getEvaluationStatus(evaluationId);
        const terminalQueueStatus = getEvaluationQueueTerminalStatus(finalStatus);
        if (terminalQueueStatus) {
          await finishDurableEvaluationQueueRecord(evaluationId, terminalQueueStatus);
          return;
        }

        if (attempts < DURABLE_QUEUE_MAX_ATTEMPTS) {
          await requeueDurableEvaluation(evaluationId, 'Worker exited without a terminal evaluation status; scheduling one safe resume attempt.');
          return;
        }

        await failDurableEvaluationBeforeExecution(job as any, 'Evaluation processing did not reach a terminal state after the permitted resume attempts. Your evaluation credit has been restored where applicable.');
        await finishDurableEvaluationQueueRecord(evaluationId, 'FAILED', 'Evaluation worker did not reach a terminal status.');
      } catch (error: any) {
        const reason = String(error?.message || error || 'Unknown durable queue worker error').slice(0, 500);
        const finalStatus = getEvaluationStatus(evaluationId);
        const terminalQueueStatus = getEvaluationQueueTerminalStatus(finalStatus);
        if (terminalQueueStatus) {
          await finishDurableEvaluationQueueRecord(evaluationId, terminalQueueStatus, reason);
          return;
        }

        if (attempts < DURABLE_QUEUE_MAX_ATTEMPTS) {
          await requeueDurableEvaluation(evaluationId, reason);
          return;
        }

        await failDurableEvaluationBeforeExecution(claimed.payload || {}, reason);
        await finishDurableEvaluationQueueRecord(evaluationId, 'FAILED', reason);
      } finally {
        clearInterval(heartbeat);
      }
    })();

    activeJobs.set(evaluationId, workerPromise);
    durableQueueStartingJobs.delete(evaluationId);
    await workerPromise;
  } finally {
    activeJobs.delete(evaluationId);
    durableQueueStartingJobs.delete(evaluationId);
    if (isProductionEvaluationQueue()) {
      void processDurableEvaluationQueue().catch((error) =>
        console.warn('[DurableEvalQueue] Follow-up queue scheduling failed:', error)
      );
    }
  }
}

async function processDurableEvaluationQueue(initialJobId?: string, initialJob?: EvaluationJobData): Promise<void> {
  if (!isProductionEvaluationQueue()) return;
  if (initialJobId && initialJob) {
    void runDurableEvaluationQueueRecord(initialJobId, initialJob).catch((error) =>
      console.error(`[DurableEvalQueue] Failed to start accepted job ${initialJobId}:`, error)
    );
    return;
  }

  if (activeJobs.size + durableQueueStartingJobs.size >= DURABLE_QUEUE_MAX_ACTIVE_JOBS) return;

  const [queued, running] = await Promise.all([
    queryFirestoreDocs<DurableEvaluationQueueRecord>(DURABLE_QUEUE_COLLECTION, [{ field: 'status', op: '==', value: 'QUEUED' }], { failOnError: true }),
    queryFirestoreDocs<DurableEvaluationQueueRecord>(DURABLE_QUEUE_COLLECTION, [{ field: 'status', op: '==', value: 'RUNNING' }], { failOnError: true }),
  ]);
  const now = Date.now();
  const candidates = [...queued, ...running]
    .filter((record) => {
      if (!record?.evaluationId || isDurableQueueTerminal(record.status)) return false;
      if (record.status === 'QUEUED' && record.nextAttemptAt && Date.parse(record.nextAttemptAt) > now) return false;
      if (record.status === 'RUNNING' && record.leaseExpiresAt && Date.parse(record.leaseExpiresAt) > now) return false;
      return true;
    })
    .sort((left, right) => String(left.createdAt || '').localeCompare(String(right.createdAt || '')));

  for (const record of candidates) {
    if (activeJobs.size + durableQueueStartingJobs.size >= DURABLE_QUEUE_MAX_ACTIVE_JOBS) break;
    void runDurableEvaluationQueueRecord(record.evaluationId).catch((error) =>
      console.error(`[DurableEvalQueue] Failed to launch queued evaluation ${record.evaluationId}:`, error)
    );
  }
}

/**
 * A status poll can wake an interrupted job after a new App Hosting instance
 * has started. The Firestore lease transaction remains the single-writer guard.
 * Poll-triggered reads are throttled per evaluation to keep Firestore usage low.
 */
export function nudgeDurableEvaluationQueue(evaluationId: string): void {
  if (!isProductionEvaluationQueue() || !evaluationId) return;
  if (activeJobs.has(evaluationId) || durableQueueStartingJobs.has(evaluationId)) return;

  const now = Date.now();
  const lastNudge = durableQueueNudgeTimes.get(evaluationId) || 0;
  if (now - lastNudge < 10_000) return;
  durableQueueNudgeTimes.set(evaluationId, now);

  if (durableQueueNudgeTimes.size > 2_000) {
    for (const [id, timestamp] of durableQueueNudgeTimes) {
      if (now - timestamp > 60 * 60 * 1000) durableQueueNudgeTimes.delete(id);
    }
  }

  void getFirestoreDoc<DurableEvaluationQueueRecord>(
    DURABLE_QUEUE_COLLECTION,
    evaluationId,
    { failOnError: true },
  ).then(async (record) => {
    // Keep the throttle entry for missing/terminal records too. A student UI
    // may poll every few seconds; clearing it here would cause repeated Firestore
    // reads for an evaluation that has no resumable durable job.
    if (!record || isDurableQueueTerminal(record.status)) return;

    const status = String(record.status || '').toUpperCase();
    const leaseUntil = Date.parse(String(record.leaseExpiresAt || ''));
    const leaseExpired = !Number.isFinite(leaseUntil) || leaseUntil <= Date.now();
    const retryAt = Date.parse(String(record.nextAttemptAt || ''));
    const retryReady = !Number.isFinite(retryAt) || retryAt <= Date.now();
    const resumable =
      (status === 'QUEUED' && retryReady) ||
      (status === 'RUNNING' && leaseExpired);

    if (resumable) {
      await runDurableEvaluationQueueRecord(evaluationId);
    }
  }).catch((error) => {
    console.warn(`[DurableEvalQueue] Status-poll recovery check failed for ${evaluationId}:`, error);
  });
}

export function startDurableEvaluationQueueRecovery(): void {
  if (!isProductionEvaluationQueue() || durableQueueRecoveryTimer) return;
  void processDurableEvaluationQueue().catch((error) =>
    console.warn('[DurableEvalQueue] Initial recovery scan failed:', error)
  );
  durableQueueRecoveryTimer = setInterval(() => {
    void processDurableEvaluationQueue().catch((error) =>
      console.warn('[DurableEvalQueue] Periodic recovery scan failed:', error)
    );
  }, DURABLE_QUEUE_POLL_MS);
  durableQueueRecoveryTimer.unref?.();
}

const TERMINAL_EVALUATION_STATUSES = new Set([
  'COMPLETED', 'NEEDS_REVIEW', 'REJECTED', 'FAILED', 'PERSISTENCE_FAILED', 'CANCELLED',
]);

function isTerminalEvaluationStatus(status: unknown): boolean {
  return TERMINAL_EVALUATION_STATUSES.has(String(status || '').toUpperCase());
}

/**
 * Revalidate the selected source before the expensive AI run. This keeps
 * Model Test / Faculty jobs on the shared MTP/PYQ evaluator without accepting
 * a stale UI selection or a reference TXT from another test.
 */
async function assertExactEvaluationSourceBinding(job: EvaluationJobData): Promise<void> {
  const evaluation = db.prepare('SELECT * FROM evaluations WHERE id = ?').get(job.evaluationId) as any;
  if (!evaluation) {
    throw new Error('EVALUATION_SOURCE_BINDING_FAILED: Evaluation record not found.');
  }

  const isModelTest = job.materialType === 'MODEL_TEST_PAPER';
  const isFacultyMock = job.requestedEvalSource === 'FACULTY_MOCK' || job.materialType === 'FACULTY_MOCK_TEST';
  // Do not impose this extra Model/Faculty source binding on legacy PYQ/MTP
  // or institute-specific jobs; they retain their existing validated flow.
  if (!isModelTest && !isFacultyMock) return;

  const sameText = (left: unknown, right: unknown): boolean => {
    const leftHash = crypto.createHash('sha256').update(String(left || '').trim(), 'utf8').digest('hex');
    const rightHash = crypto.createHash('sha256').update(String(right || '').trim(), 'utf8').digest('hex');
    return leftHash === rightHash;
  };
  const same = (left: unknown, right: unknown): boolean =>
    String(left ?? '').trim().toUpperCase() === String(right ?? '').trim().toUpperCase();

  if (!same(evaluation.level, job.level) ||
      !same(evaluation.subject_key, job.subjectKey) ||
      !same(evaluation.subject_name, job.subjectName) ||
      !same(evaluation.paper, job.paper || 'Paper 1') ||
      !same(evaluation.attempt, job.attempt)) {
    throw new Error('EVALUATION_SOURCE_BINDING_FAILED: Selected course, subject, paper or attempt no longer matches the accepted evaluation.');
  }

  if (job.materialType === 'MODEL_TEST_PAPER') {
    const maxModelTestNumber = getMaxModelTestNumberForLevel(job.level);
    const expectedNumber = Number(job.modelTestNumber);
    if (!Number.isInteger(expectedNumber) || expectedNumber < 1 || expectedNumber > maxModelTestNumber ||
        Number(evaluation.model_test_number) !== expectedNumber ||
        String(evaluation.material_id || '') !== String(job.referenceMaterialId || '')) {
      throw new Error('MODEL_TEST_SOURCE_BINDING_FAILED: Selected Model Test number or material ID does not match the saved evaluation.');
    }

    const material = db.prepare(
      "SELECT id, level, subject_key, subject_name, paper, model_test_number, source_format, file_id, combined_source_material_id, question_material_id, suggested_answer_material_id, marking_scheme_material_id, question_paper_text, suggested_answers_text, marking_scheme_text FROM evaluation_materials WHERE id = ? AND material_type = 'MODEL_TEST_PAPER' AND status = 'ACTIVE' AND source_type = 'ADMIN' AND admin_approved = 1 LIMIT 1"
    ).get(job.referenceMaterialId) as any;

    let authoritativeQuestionPaper = String(material?.question_paper_text || '').trim();
    let authoritativeSuggestedAnswers = String(material?.suggested_answers_text || '').trim();
    const authoritativeMarkingScheme = String(material?.marking_scheme_text || '').trim();
    const storedComponentSourceIds = material
      ? resolveMaterialComponentSourceIds(material, authoritativeMarkingScheme)
      : null;
    const componentSourceIdsMatch = Boolean(
      storedComponentSourceIds &&
      same(storedComponentSourceIds.sourceFormat, job.sourceFormat || 'SEPARATE') &&
      same(storedComponentSourceIds.combinedSourceMaterialId, job.combinedSourceMaterialId) &&
      same(storedComponentSourceIds.questionMaterialId, job.questionMaterialId) &&
      same(storedComponentSourceIds.suggestedAnswerMaterialId, job.suggestedAnswerMaterialId) &&
      same(storedComponentSourceIds.markingSchemeMaterialId, job.markingSchemeMaterialId)
    );
    if (material?.source_format === 'COMBINED' &&
        (!authoritativeQuestionPaper || !authoritativeSuggestedAnswers ||
          authoritativeQuestionPaper === authoritativeSuggestedAnswers ||
          authoritativeQuestionPaper.length < 50 || authoritativeSuggestedAnswers.length < 50)) {
      const sourceForSplit = authoritativeQuestionPaper.length >= 50
        ? authoritativeQuestionPaper
        : authoritativeSuggestedAnswers;
      if (sourceForSplit.length >= 50) {
        const normalized = normalizeAndSplitCombinedPyq(sourceForSplit);
        authoritativeQuestionPaper = normalized.questionPaperText;
        authoritativeSuggestedAnswers = normalized.suggestedAnswersText;
      }
    }

    if (!material ||
        !componentSourceIdsMatch ||
        Number(material.model_test_number) !== expectedNumber ||
        !same(material.level, job.level) ||
        !same(material.subject_key, job.subjectKey) ||
        !same(material.subject_name, job.subjectName) ||
        !same(material.paper, job.paper || 'Paper 1') ||
        !sameText(authoritativeQuestionPaper, job.referenceQuestionPaperText) ||
        !sameText(authoritativeSuggestedAnswers, job.referenceSuggestedAnswersText) ||
        !sameText(authoritativeMarkingScheme, job.markingSchemeText)) {
      throw new Error('MODEL_TEST_SOURCE_BINDING_FAILED: The selected Model Test Question Paper, Suggested Answer or Marking Scheme changed or belongs to another test.');
    }
  }

  if (job.requestedEvalSource === 'FACULTY_MOCK' || job.materialType === 'FACULTY_MOCK_TEST') {
    const mockId = String(job.facultyMockTestId || '').trim();
    if (!mockId || job.requestedEvalSource !== 'FACULTY_MOCK' ||
        job.materialType !== 'FACULTY_MOCK_TEST' ||
        String(evaluation.faculty_mock_test_id || '') !== mockId ||
        String(evaluation.material_id || '') !== mockId ||
        String(job.referenceMaterialId || '') !== mockId) {
      throw new Error('FACULTY_MOCK_SOURCE_BINDING_FAILED: Selected Faculty Mock ID does not match the saved evaluation.');
    }

    let mock: any = null;
    try {
      mock = await getFirestoreDoc<any>('faculty_mock_tests', mockId, { failOnError: true });
    } catch (sourceLookupError) {
      if (isProductionEvaluationQueue()) {
        throw new Error('FACULTY_MOCK_SOURCE_LOOKUP_FAILED: The worker could not verify the selected mock against the shared database. It will not use an instance-local stale copy.');
      }
      console.warn('[AsyncEval] Shared Faculty Mock source lookup unavailable in local development; using the local fixture cache:', sourceLookupError);
    }
    if (!mock && !isProductionEvaluationQueue()) {
      mock = db.prepare('SELECT * FROM faculty_mock_tests WHERE id = ?').get(mockId) as any;
    }

    // Recreate the same preloaded material adapter used by studentRoutes before
    // resolving component IDs. This intentionally preserves synthetic legacy IDs
    // when a published mock predates separate component-file metadata.
    const expectedMockSourceIds = mock
      ? resolveFacultyMockComponentSourceIds(mock)
      : null;
    const expectedMaximumMarks = mock
      ? resolveOfficialPaperMaximumMarks(Number(mock.maximum_marks || 100), mock.question_paper_text)
      : null;

    const sourceIdsMatch = Boolean(
      expectedMockSourceIds &&
      String(expectedMockSourceIds.questionMaterialId || '').trim() === String(job.questionMaterialId || '').trim() &&
      String(expectedMockSourceIds.suggestedAnswerMaterialId || '').trim() === String(job.suggestedAnswerMaterialId || '').trim() &&
      String(expectedMockSourceIds.markingSchemeMaterialId || '').trim() === String(job.markingSchemeMaterialId || '').trim()
    );

    const sourceMismatchFields: string[] = [];
    if (!mock) {
      sourceMismatchFields.push('mock_record_missing');
    } else {
      if (!same(mock.course_level, job.level)) sourceMismatchFields.push('course_level');
      if (!same(mock.subject_key, job.subjectKey)) sourceMismatchFields.push('subject_key');
      if (!same(mock.subject_name, job.subjectName)) sourceMismatchFields.push('subject_name');
      if (!same(mock.paper || 'Paper 1', job.paper || 'Paper 1')) sourceMismatchFields.push('paper');
      if (!same(mock.attempt, job.attempt)) sourceMismatchFields.push('attempt');
      if (!sameText(mock.question_paper_text, job.referenceQuestionPaperText)) sourceMismatchFields.push('question_paper_text');
      if (!sameText(mock.suggested_answers_text, job.referenceSuggestedAnswersText)) sourceMismatchFields.push('suggested_answers_text');
      if (!sameText(mock.marking_scheme_text, job.markingSchemeText)) sourceMismatchFields.push('marking_scheme_text');
      if (!sourceIdsMatch) sourceMismatchFields.push('source_file_ids');
      if (expectedMaximumMarks !== Number(job.officialPaperMaxMarks || 100)) sourceMismatchFields.push('maximum_marks');
    }

    if (sourceMismatchFields.length > 0) {
      console.error('[AsyncEval] Faculty Mock source binding mismatch:', {
        evaluationId: job.evaluationId,
        mockId,
        mismatchFields: sourceMismatchFields,
        expectedMaximumMarks,
        submittedMaximumMarks: Number(job.officialPaperMaxMarks || 100),
      });
      throw new Error(
        'FACULTY_MOCK_SOURCE_BINDING_FAILED: The selected Faculty Mock source snapshot did not match the published mock (' +
        sourceMismatchFields.join(', ') +
        ').'
      );
    }
  }
}


/**
 * Returns Faculty Mock copy access when asynchronous AI evaluation fails.
 * Successful / NEEDS_REVIEW evaluations keep the copy consumed.
 */
async function releaseFacultyMockCopyAccessForFailedEvaluation(evaluationId: string): Promise<void> {
  try {
    const evaluation = db.prepare(`
      SELECT student_id, faculty_mock_test_id, faculty_mock_payment_order_id
      FROM evaluations WHERE id = ?
    `).get(evaluationId) as {
      student_id?: string;
      faculty_mock_test_id?: string | null;
      faculty_mock_payment_order_id?: string | null;
    } | undefined;
    if (!evaluation?.faculty_mock_test_id || !evaluation.student_id) return;

    if (evaluation.faculty_mock_payment_order_id) {
      await releaseFacultyMockPaidCopy(
        evaluation.faculty_mock_payment_order_id,
        evaluation.student_id,
        evaluation.faculty_mock_test_id,
        evaluationId,
      );
      db.prepare(`
        UPDATE faculty_mock_copy_purchases
        SET status = 'AVAILABLE', evaluation_id = NULL, consumed_at = NULL
        WHERE order_id = ? AND evaluation_id = ? AND status = 'CONSUMED'
      `).run(evaluation.faculty_mock_payment_order_id, evaluationId);
    } else {
      await releaseFacultyMockFreeCopy(evaluation.student_id, evaluation.faculty_mock_test_id, evaluationId);
      db.prepare(`
        DELETE FROM faculty_mock_free_uses
        WHERE student_id = ? AND faculty_mock_test_id = ? AND evaluation_id = ?
      `).run(evaluation.student_id, evaluation.faculty_mock_test_id, evaluationId);
    }
  } catch (error) {
    console.warn(`[AsyncEval] Could not restore Faculty Mock copy access for ${evaluationId}:`, error);
  }
}

function getEvaluationStatus(evaluationId: string): string {
  const row = db.prepare('SELECT status FROM evaluations WHERE id = ?').get(evaluationId) as { status?: string } | undefined;
  return String(row?.status || '').toUpperCase();
}

export function isEvaluationJobActive(evaluationId: string): boolean {
  return activeJobs.has(evaluationId);
}

export function updateEvaluationProgress(
  evaluationId: string,
  status: string,
  stage: string,
  percentage: number,
  message: string
) {
  try {
    const update = db.prepare(`
      UPDATE evaluations
      SET status = ?,
          progress_stage = ?,
          progress_percentage = ?,
          progress_message = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND UPPER(COALESCE(status, '')) NOT IN ('COMPLETED', 'NEEDS_REVIEW', 'REJECTED', 'FAILED', 'PERSISTENCE_FAILED', 'CANCELLED')
    `).run(status, stage, Math.min(100, Math.max(0, Math.round(percentage))), message, evaluationId);

    if (update.changes !== 1 && isTerminalEvaluationStatus(getEvaluationStatus(evaluationId))) {
      throw new Error(`TERMINAL_EVALUATION_STATE_PRESERVED:${getEvaluationStatus(evaluationId)}`);
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('TERMINAL_EVALUATION_STATE_PRESERVED:')) throw err;
    console.warn(`[AsyncEval] Error updating progress for ${evaluationId}:`, err);
  }
}

/**
 * Executes the full AI evaluation pipeline asynchronously in the background.
 * The HTTP caller receives an immediate job-created response, and the student's
 * client tracks authoritative state from the database.
 */
export async function executeEvaluationJob(job: EvaluationJobData): Promise<void> {
  const { evaluationId, studentId, subjectName, entitlementSource: initialEntitlementSource, resolvedSponsoringInstituteId, resolvedInstituteName, requestedEvalSource } = job;
  let entitlementSource = initialEntitlementSource;
  let successfulSettlementDebited = false;

  console.log(`[AsyncEval] Starting background evaluation for ${evaluationId} (${subjectName}, Student: ${studentId})`);

  try {
    // Stage 1: Optical / Answer Sheet Processing
    updateEvaluationProgress(
      evaluationId,
      'READING_ANSWER_SHEET',
      'READING_ANSWER_SHEET',
      15,
      'Reading handwritten answer pages, ledger tables and optical layouts...'
    );

    // Stage 2: Question Mapping & Coverage
    updateEvaluationProgress(
      evaluationId,
      'IDENTIFYING_QUESTIONS',
      'IDENTIFYING_QUESTIONS',
      35,
      'Identifying question numbers, sub-questions, and compulsory parts...'
    );

    // Stage 3: AI Step-Marking Execution against ICAI Rubrics
    updateEvaluationProgress(
      evaluationId,
      'EVALUATING_ANSWERS',
      'EVALUATING_ANSWERS',
      55,
      'Evaluating step-by-step working notes, legal provisions, and standard answers...'
    );

    // SERVER-SIDE INTEGRITY GATE: Validate mtpSeries across the entire EvaluationEvidencePackage
    // Compares requested series against metadata of retrieved Question Paper, Suggested Answer, and Marking Scheme
    const evidencePackage: EvaluationEvidencePackage = {
      evaluationId,
      requestedMtpSeries: job.mtpSeries,
      requestedModelTestNumber: job.modelTestNumber,
      rawMaterialModelTestNumber: job.modelTestNumber,
      materialType: job.materialType,
      caLevel: job.level,
      subjectKey: job.subjectKey,
      subjectName: job.subjectName,
      paper: job.paper,
      attempt: job.attempt,
      syllabusVersion: job.syllabusVersion,
      rawMaterialId: job.referenceMaterialId,
      rawMaterialTitle: job.referenceMaterialTitle,
      rawMaterialMtpSeries: job.mtpSeries,
      retrievedAt: new Date().toISOString(),
      integrityGateStatus: 'PENDING',
      questionPaper: {
        text: job.referenceQuestionPaperText,
        metadata: {
          materialId: job.questionMaterialId || job.combinedSourceMaterialId || job.referenceMaterialId,
          version: job.referenceMaterialVersion || 'UNSPECIFIED',
          checksum: crypto.createHash('sha256').update(job.referenceQuestionPaperText || '', 'utf8').digest('hex'),
          textLength: (job.referenceQuestionPaperText || '').length,
          mtpSeries: job.mtpSeries,
          modelTestNumber: job.modelTestNumber,
          componentType: 'QUESTION_PAPER',
          title: job.referenceMaterialTitle,
          detectedSeries:
            detectMtpSeriesFromText(job.referenceMaterialTitle || '') ||
            detectMtpSeriesFromText((job.referenceQuestionPaperText || '').slice(0, 1000)),
        },
      },
      suggestedAnswers: {
        text: job.referenceSuggestedAnswersText,
        metadata: {
          materialId: job.suggestedAnswerMaterialId || job.combinedSourceMaterialId || job.referenceMaterialId,
          version: job.referenceMaterialVersion || 'UNSPECIFIED',
          checksum: crypto.createHash('sha256').update(job.referenceSuggestedAnswersText || '', 'utf8').digest('hex'),
          textLength: (job.referenceSuggestedAnswersText || '').length,
          mtpSeries: job.mtpSeries,
          modelTestNumber: job.modelTestNumber,
          componentType: 'SUGGESTED_ANSWERS',
          title: job.referenceMaterialTitle,
          detectedSeries:
            detectMtpSeriesFromText(job.referenceMaterialTitle || '') ||
            detectMtpSeriesFromText((job.referenceSuggestedAnswersText || '').slice(0, 1000)),
        },
      },
      markingScheme: {
        text: job.markingSchemeText || '',
        metadata: {
          materialId: job.markingSchemeMaterialId || job.combinedSourceMaterialId || job.referenceMaterialId,
          version: job.referenceMaterialVersion || 'UNSPECIFIED',
          checksum: crypto.createHash('sha256').update(job.markingSchemeText || '', 'utf8').digest('hex'),
          textLength: (job.markingSchemeText || '').length,
          mtpSeries: job.mtpSeries,
          modelTestNumber: job.modelTestNumber,
          componentType: 'MARKING_SCHEME',
          title: `${job.referenceMaterialTitle || 'Reference Material'} Marking Scheme`,
          detectedSeries: detectMtpSeriesFromText((job.markingSchemeText || '').slice(0, 1000)),
        },
      },
    };

    // Fail closed before any AI work if the selected Model / Faculty material
    // no longer matches the exact submission captured by the API route.
    await assertExactEvaluationSourceBinding(job);

    try {
      enforceEvaluationEvidencePackageMtpGate(evidencePackage);
    } catch (gateErr: any) {
      const gateReason = String(gateErr?.message || 'Reference-material integrity check failed.').slice(0, 500);
      const studentFacingReason = 'The selected question paper, suggested answer or marking scheme did not pass the reference-material integrity checks. Please verify your selected exam attempt and paper, or contact support for a review.';
      console.error(`[AsyncEval] Integrity Gate Mismatch for evaluation ${evaluationId}:`, gateReason);
      const rejectionUpdate = db.prepare(`
        UPDATE evaluations
        SET status = 'REJECTED',
            rejection_reason = ?,
            error_message = ?,
            progress_stage = 'REJECTED',
            progress_percentage = 100,
            progress_message = 'Reference material verification failed',
            completed_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND UPPER(COALESCE(status, '')) NOT IN ('COMPLETED', 'NEEDS_REVIEW', 'REJECTED', 'FAILED', 'PERSISTENCE_FAILED', 'CANCELLED')
      `).run(studentFacingReason, gateReason, evaluationId);

      if (rejectionUpdate.changes === 1) {
        try {
          await markParakhEvaluationFailed(evaluationId);
        } catch (parakhError) {
          console.warn(`[PARAKH] Could not exclude rejected evaluation ${evaluationId}:`, parakhError);
        }
        const notificationId = `notif_eval_rejected_${evaluationId}`;
        const notificationMessage = `Your evaluation for ${subjectName || 'the selected paper'} was rejected. Reason: ${studentFacingReason}\n\nIf you believe this decision is incorrect, please contact support for a review.`;
        db.prepare(`
          INSERT OR IGNORE INTO notifications (id, user_id, title, message, type)
          VALUES (?, ?, 'Evaluation Rejected', ?, 'EVALUATION')
        `).run(notificationId, studentId, notificationMessage);

        const rejectedRow = db.prepare('SELECT * FROM evaluations WHERE id = ?').get(evaluationId) as any;
        const notificationRow = db.prepare('SELECT * FROM notifications WHERE id = ?').get(notificationId) as any;
        if (rejectedRow) await syncRecordToFirestore('evaluations', evaluationId, rejectedRow);
        if (notificationRow) await syncRecordToFirestore('notifications', notificationId, notificationRow);

        // The integrity gate can run after an entitlement was accepted. Refund only if
        // this worker established the rejection transition, avoiding duplicate refunds.
        if (job.creditAlreadyConsumed && !job.isRecoveryRetry &&
          (entitlementSource === 'PROMO' || entitlementSource === 'PERSONAL_FREE' || entitlementSource === 'PERSONAL_PURCHASED_CREDIT')) {
          try {
            const restored = refundEvaluationCreditAtomic({ userId: studentId, evaluationId, entitlementSource });
            if (restored) {
              db.prepare('UPDATE evaluations SET consumed_from_personal_credits = 0 WHERE id = ?').run(evaluationId);
              await syncStudentCreditsToFirestore(studentId);
            }
          } catch (refundErr) {
            console.warn(`[AsyncEval] Rejection refund error for ${evaluationId}:`, refundErr);
          }
        }
      }
      throw gateErr;
    }

    let evaluationResult = await evaluateCAAnswerSheet({
      evaluationId,
      studentName: job.studentName,
      icaiRegistrationNumber: job.icaiRegistrationNumber || 'N/A',
      level: job.level,
      materialType: job.materialType,
      mtpSeries: job.materialType === 'MTP' ? job.mtpSeries : undefined,
      modelTestNumber: job.materialType === 'MODEL_TEST_PAPER' ? job.modelTestNumber : undefined,
      facultyMockTestId: job.facultyMockTestId,
      evaluationSource: job.requestedEvalSource,
      subjectKey: job.subjectKey,
      subjectName: job.subjectName,
      paper: job.paper,
      attempt: job.attempt,
      syllabusVersion: job.syllabusVersion,
      officialPaperMaxMarks: job.officialPaperMaxMarks,
      checkingMode: job.checkingMode,
      fileBase64: job.fileBase64,
      mimeType: job.mimeType || 'application/pdf',
      referenceQuestionPaperText: job.referenceQuestionPaperText,
      referenceSuggestedAnswersText: job.referenceSuggestedAnswersText,
      markingSchemeText: job.markingSchemeText || '',
      referenceMaterialTitle: job.referenceMaterialTitle,
      referenceMaterialVersion: job.referenceMaterialVersion,
      referenceMaterialId: job.referenceMaterialId,
      sourceFormat: job.sourceFormat,
      combinedSourceMaterialId: job.combinedSourceMaterialId,
      questionMaterialId: job.questionMaterialId,
      suggestedAnswerMaterialId: job.suggestedAnswerMaterialId,
      markingSchemeMaterialId: job.markingSchemeMaterialId,
    });

    // Stage 4: Marks Allocation & Consequential Verification
    updateEvaluationProgress(
      evaluationId,
      'CALCULATING_MARKS',
      'CALCULATING_MARKS',
      75,
      'Verifying step calculations, MCQ scores, and total mark allocation...'
    );

    // Structural Deduplication Validation: Canonical Exactly-Once Rule
    const paperStruct = getAuthoritativePaperStructure({
      level: job.level,
      materialType: job.materialType,
      paper: job.paper || job.subjectName,
      subjectName: job.subjectName,
      questionPaperText: job.referenceQuestionPaperText,
      markingSchemeText: job.markingSchemeText,
      suggestedAnswersText: job.referenceSuggestedAnswersText,
      officialPaperMaxMarks: job.officialPaperMaxMarks || 100,
    });

    let dedupValidation = validateQuestionDeduplication(evaluationResult.questions || [], paperStruct.subQuestions);
    if (!dedupValidation.isValid) {
      console.warn(`[AsyncEval] Duplicate question instances detected for evaluation ${evaluationId}: ${dedupValidation.details}. Resolving deterministically.`);
      evaluationResult.questions = deduplicateQuestionList(evaluationResult.questions || [], paperStruct.subQuestions);
      if (evaluationResult.coverageMap && Array.isArray(evaluationResult.coverageMap.attemptedQuestions)) {
        evaluationResult.coverageMap.attemptedQuestions = deduplicateQuestionList(evaluationResult.coverageMap.attemptedQuestions, paperStruct.subQuestions);
      }
      dedupValidation = validateQuestionDeduplication(evaluationResult.questions || [], paperStruct.subQuestions);
      if (!dedupValidation.isValid) {
        throw new Error(`CRITICAL_INTEGRITY_VIOLATION: Cannot generate final report due to persistent question duplication: ${dedupValidation.details}`);
      }
    } else if (evaluationResult.coverageMap && Array.isArray(evaluationResult.coverageMap.attemptedQuestions)) {
      evaluationResult.coverageMap.attemptedQuestions = deduplicateQuestionList(evaluationResult.coverageMap.attemptedQuestions, paperStruct.subQuestions);
    }

    // Run the bounded second-pass supervisor after the first complete evaluation.
    // Clean results incur no extra model calls; only repairable question-level issues
    // receive up to four targeted re-evaluations before unresolved cases stay in review.
    if (ENABLE_EVALUATION_SUPERVISOR) {
      const { runEvaluationSupervisor } = await import('./evaluationSupervisorService.js');
      const supervisorReferenceSourceType: ReferenceSourceType =
        job.materialType === 'FACULTY_MOCK_TEST' || job.requestedEvalSource === 'FACULTY_MOCK'
          ? 'FACULTY_MOCK'
          : job.materialType === 'MODEL_TEST_PAPER'
            ? 'MODEL_TEST'
            : job.requestedEvalSource === 'INSTITUTE'
              ? 'INSTITUTE'
              : 'GLOBAL';
      const supervisorReferenceMetadata: QuestionReferenceLockMetadata = {
        qpMaterialId: job.questionMaterialId || job.combinedSourceMaterialId || job.referenceMaterialId,
        saMaterialId: job.suggestedAnswerMaterialId || job.combinedSourceMaterialId || job.referenceMaterialId,
        msMaterialId: job.markingSchemeMaterialId || job.combinedSourceMaterialId || job.referenceMaterialId,
        materialVersions: job.referenceMaterialVersion || '1.0',
        sourceType: supervisorReferenceSourceType,
        materialType: job.materialType,
        mtpSeries: job.materialType === 'MTP' ? job.mtpSeries : undefined,
        modelTestNumber: job.materialType === 'MODEL_TEST_PAPER' ? job.modelTestNumber : undefined,
        facultyMockTestId: job.facultyMockTestId,
        materialTitle: job.referenceMaterialTitle,
      };
      evaluationResult = await runEvaluationSupervisor({
        evaluationResult,
        pdfBuffer: job.pdfBuf,
        paperStructure: paperStruct,
        questionPaperText: job.referenceQuestionPaperText || '',
        suggestedAnswersText: job.referenceSuggestedAnswersText || '',
        markingSchemeText: job.markingSchemeText || '',
        checkingMode: (job.checkingMode as any) || 'standard',
        level: job.level,
        subjectName: job.subjectName,
        officialPaperMaxMarks: job.officialPaperMaxMarks || 100,
        paper: job.paper,
        subjectKey: job.subjectKey,
        materialId: job.questionMaterialId || job.combinedSourceMaterialId || job.referenceMaterialId,
        referenceMetadata: supervisorReferenceMetadata,
        coverageMap: evaluationResult.coverageMap || null,
      });
    }

    // Stage 5: Artifact Generation (Checked Copy & Detailed Report PDFs)
    updateEvaluationProgress(
      evaluationId,
      'FINALIZING_REPORT',
      'FINALIZING_REPORT',
      85,
      'Verifying question-level evaluation before preparing student artifacts...'
    );

    const uploadsDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    let originalPageCount = 0;
    let checkedCopyStatus = 'PENDING';
    let reportStatus = 'PENDING';
    let structuredAnnotationsJson = '[]';
    const completedQuestionEvaluationCount = countCompletedQuestionEvaluations(evaluationResult);

    const evalIdentityRow = db.prepare(`
      SELECT e.display_id, p.student_code, p.icai_registration_number, u.full_name
      FROM evaluations e
      LEFT JOIN student_profiles p ON p.user_id = e.student_id
      LEFT JOIN users u ON u.id = e.student_id
      WHERE e.id = ?
    `).get(evaluationId) as any;
    const resolvedDisplayId = evalIdentityRow?.display_id || evaluationId;
    const resolvedStudentCode = evalIdentityRow?.student_code || undefined;
    const resolvedRegNo = evalIdentityRow?.icai_registration_number || undefined;

    // Determine the actual source page count independently of evaluation status.
    // A diagnostic-only result must still retain the correct original page count
    // for the admin review screen, but it must not create a "Checked Copy".
    try {
      const origDoc = await PDFDocument.load(job.pdfBuf, { ignoreEncryption: true });
      originalPageCount = origDoc.getPageCount();
      if (!Number.isInteger(originalPageCount) || originalPageCount <= 0) {
        throw new Error('Original answer sheet PDF contains no physical pages.');
      }
    } catch (pdfErr) {
      console.warn('[AsyncEval] Could not establish original PDF page count:', pdfErr);
      originalPageCount = 0;
    }

    if (completedQuestionEvaluationCount <= 0) {
      console.warn(
        `[AsyncEval] Withholding Checked Copy and Detailed Report for ${evaluationId}: no question-level academic evaluation completed. The result remains diagnostic-only and NEEDS_REVIEW.`
      );
    } else if (originalPageCount <= 0) {
      console.warn(
        `[AsyncEval] Withholding Checked Copy and Detailed Report for ${evaluationId}: original PDF page count could not be verified.`
      );
    } else {
      // 5A. Generate Checked Copy PDF only when at least one question has
      // actually completed academic evaluation. A genuine evaluated 0/maximum
      // answer counts; a technical failure or empty review result does not.
      try {
        const meta = {
          id: evaluationId,
          modelTestNumber: job.modelTestNumber,
          displayId: resolvedDisplayId,
          studentCode: resolvedStudentCode,
          icaiRegistrationNumber: resolvedRegNo,
          studentName: evalIdentityRow?.full_name || job.studentName,
          level: job.level,
          subjectName: job.subjectName,
          paper: job.paper || 'Paper 1',
          attempt: job.attempt || 'May 2026',
          materialType: job.materialType,
          mtpSeries: job.mtpSeries,
          checkingMode: job.checkingMode,
          totalMarks: evaluationResult.totalMarks,
          maximumMarks: evaluationResult.maximumMarks,
          percentage: evaluationResult.percentage,
          grade: evaluationResult.grade,
          createdAt: new Date().toISOString(),
        };

        const structuredAnn = buildStructuredAnnotations(meta, evaluationResult, originalPageCount);
        structuredAnnotationsJson = JSON.stringify(structuredAnn);

        const checkedPdfBuf = await generateCheckedCopyPdf(meta, evaluationResult, job.pdfBuf);
        const checkedFilePath = path.join(uploadsDir, `${evaluationId}_checked_copy.pdf`);
        fs.writeFileSync(checkedFilePath, checkedPdfBuf);

        await savePersistentFile(
          `${evaluationId}_checked_copy`,
          `${evaluationId}_checked_copy.pdf`,
          'application/pdf',
          checkedPdfBuf,
          'EVALUATION_CHECKED_COPY',
          {
            ownerUserId: studentId,
            evaluationId,
            instituteId: resolvedSponsoringInstituteId || null,
          }
        );
        checkedCopyStatus = 'READY';
      } catch (annErr) {
        console.warn('[AsyncEval] Error generating checked copy PDF:', annErr);
      }

      // 5B. Detailed reports are also withheld when no question-level academic
      // evaluation exists; a 0/100 diagnostic placeholder is not a score report.
      try {
        const reportMeta = {
          id: evaluationId,
          displayId: resolvedDisplayId,
          studentCode: resolvedStudentCode,
          icaiRegistrationNumber: resolvedRegNo,
          studentName: evalIdentityRow?.full_name || job.studentName || 'CA Student',
          level: job.level,
          subjectName: job.subjectName,
          paper: job.paper || 'Paper 1',
          attempt: job.attempt || 'May 2026',
          materialType: job.materialType,
          mtpSeries: job.mtpSeries,
          checkingMode: job.checkingMode,
          totalMarks: evaluationResult.totalMarks,
          maximumMarks: evaluationResult.maximumMarks,
          percentage: evaluationResult.percentage,
          grade: evaluationResult.grade,
          createdAt: new Date().toISOString(),
          evaluationSource: requestedEvalSource,
          instituteName: resolvedInstituteName || undefined,
        };

        const reportPdfBuf = await generateDetailedReportPdf(reportMeta, evaluationResult);
        const reportFilePath = path.join(uploadsDir, `${evaluationId}_report.pdf`);
        fs.writeFileSync(reportFilePath, reportPdfBuf);

        await savePersistentFile(
          `${evaluationId}_report`,
          `Evaluation_Report_${evaluationId}.pdf`,
          'application/pdf',
          reportPdfBuf,
          'EVALUATION_REPORT',
          {
            ownerUserId: studentId,
            evaluationId,
            instituteId: resolvedSponsoringInstituteId || null,
          }
        );
        reportStatus = 'READY';
      } catch (reportErr) {
        console.warn('[AsyncEval] Error pre-generating detailed report PDF:', reportErr);
      }
    }

    // MTP Series Authoritative Integrity Gate (Requirement: verify series matching before COMPLETED)
    if (job.materialType === 'MTP') {
      const evalRow = db.prepare('SELECT mtp_series, material_id FROM evaluations WHERE id = ?').get(evaluationId) as any;
      const dbSeries = evalRow?.mtp_series !== undefined && evalRow?.mtp_series !== null ? Number(evalRow.mtp_series) : null;
      const jobSeries = job.mtpSeries !== undefined && job.mtpSeries !== null ? Number(job.mtpSeries) : null;

      let materialSeries: number | null = null;
      if (evalRow?.material_id) {
        const matRow = (db.prepare('SELECT mtp_series FROM evaluation_materials WHERE id = ?').get(evalRow.material_id) as any)
          || (db.prepare('SELECT mtp_series FROM institute_materials WHERE id = ?').get(evalRow.material_id) as any);
        if (matRow && matRow.mtp_series !== null && matRow.mtp_series !== undefined) {
          materialSeries = Number(matRow.mtp_series);
        }
      }

      const isSeriesValid = jobSeries === 1 || jobSeries === 2;
      const matchesDb = dbSeries === jobSeries;
      const matchesMaterial = materialSeries === null || materialSeries === jobSeries;

      if (!isSeriesValid || !matchesDb || !matchesMaterial) {
        const mismatchErr = `CRITICAL_INTEGRITY_VIOLATION: MTP Series mismatch detected (Job: ${jobSeries}, DB: ${dbSeries}, Material: ${materialSeries}). Evaluation halted to protect academic validity.`;
        console.error(`[AsyncEval] ${mismatchErr}`);
        const failureClaim = db.prepare(`
          UPDATE evaluations
          SET status = 'FAILED',
              progress_stage = 'FAILED',
              progress_percentage = 0,
              progress_message = ?,
              error_message = ?,
              completed_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
            AND UPPER(COALESCE(status, '')) NOT IN ('COMPLETED', 'NEEDS_REVIEW', 'REJECTED', 'FAILED', 'PERSISTENCE_FAILED', 'CANCELLED')
        `).run(mismatchErr, mismatchErr, evaluationId);

        // A concurrent terminal decision wins. Only refund if this worker actually
        // claimed the FAILED transition.
        if (failureClaim.changes === 1) {
          await releaseFacultyMockCopyAccessForFailedEvaluation(evaluationId);
          if (
            job.creditAlreadyConsumed && !job.isRecoveryRetry &&
            (entitlementSource === 'PROMO' || entitlementSource === 'PERSONAL_FREE' || entitlementSource === 'PERSONAL_PURCHASED_CREDIT')
          ) {
            try {
              const restored = refundEvaluationCreditAtomic({ userId: studentId, evaluationId, entitlementSource });
              if (restored) {
                db.prepare('UPDATE evaluations SET consumed_from_personal_credits = 0 WHERE id = ?').run(evaluationId);
                await syncStudentCreditsToFirestore(studentId);
              }
            } catch (refundErr) {
              console.warn(`[AsyncEval] MTP integrity failure refund error for ${evaluationId}:`, refundErr);
            }
          }
          const failedRow = db.prepare('SELECT * FROM evaluations WHERE id = ?').get(evaluationId) as any;
          if (failedRow) await syncRecordToFirestore('evaluations', evaluationId, failedRow);
        }
        return;
      }
    }

    // Model Test Paper identity must still match across the job, saved evaluation,
    // and exact reference material before a result can be certified.
    if (job.materialType === 'MODEL_TEST_PAPER') {
      const evalRow = db.prepare('SELECT model_test_number, material_id FROM evaluations WHERE id = ?').get(evaluationId) as any;
      const dbModelNumber = evalRow?.model_test_number !== undefined && evalRow?.model_test_number !== null
        ? Number(evalRow.model_test_number)
        : null;
      const jobModelNumber = job.modelTestNumber !== undefined && job.modelTestNumber !== null
        ? Number(job.modelTestNumber)
        : null;

      let materialModelNumber: number | null = null;
      if (evalRow?.material_id) {
        const materialRow = db.prepare(
          'SELECT model_test_number FROM evaluation_materials WHERE id = ? AND material_type = ?'
        ).get(evalRow.material_id, 'MODEL_TEST_PAPER') as any;
        if (materialRow?.model_test_number !== undefined && materialRow?.model_test_number !== null) {
          materialModelNumber = Number(materialRow.model_test_number);
        }
      }

      const isModelNumberValid = Number.isInteger(jobModelNumber) && jobModelNumber! >= 1 && jobModelNumber! <= getMaxModelTestNumberForLevel(job.level);
      const matchesEvaluation = dbModelNumber === jobModelNumber;
      const matchesMaterial = materialModelNumber === jobModelNumber;

      if (!isModelNumberValid || !matchesEvaluation || !matchesMaterial) {
        const mismatchErr = `CRITICAL_INTEGRITY_VIOLATION: Model Test Paper identity mismatch detected (Job: ${jobModelNumber}, Evaluation: ${dbModelNumber}, Material: ${materialModelNumber}). Evaluation halted to protect academic validity.`;
        console.error(`[AsyncEval] ${mismatchErr}`);
        const failureClaim = db.prepare(`
          UPDATE evaluations
          SET status = 'FAILED',
              progress_stage = 'FAILED',
              progress_percentage = 0,
              progress_message = ?,
              error_message = ?,
              completed_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
            AND UPPER(COALESCE(status, '')) NOT IN ('COMPLETED', 'NEEDS_REVIEW', 'REJECTED', 'FAILED', 'PERSISTENCE_FAILED', 'CANCELLED')
        `).run(mismatchErr, mismatchErr, evaluationId);

        if (failureClaim.changes === 1) {
          await releaseFacultyMockCopyAccessForFailedEvaluation(evaluationId);
          if (
            job.creditAlreadyConsumed && !job.isRecoveryRetry &&
            (entitlementSource === 'PROMO' || entitlementSource === 'PERSONAL_FREE' || entitlementSource === 'PERSONAL_PURCHASED_CREDIT')
          ) {
            try {
              refundEvaluationCreditAtomic({ userId: studentId, evaluationId, entitlementSource });
              await syncStudentCreditsToFirestore(studentId);
            } catch (refundErr) {
              console.warn(`[AsyncEval] Model Test integrity failure refund error for ${evaluationId}:`, refundErr);
            }
          }
          const failedRow = db.prepare('SELECT * FROM evaluations WHERE id = ?').get(evaluationId) as any;
          if (failedRow) await syncRecordToFirestore('evaluations', evaluationId, failedRow);
        }
        return;
      }
    }

    // Stage 6: Automatic deterministic consistency verification & certification gate
    const consistencyReport = validateAuthoritativeConsistency(evaluationResult);
    const runPackage = evaluationResult.evaluationRunPackage;
    const renderManifest = runPackage?.renderManifest;
    const pageAudit = runPackage?.pageCoverageAudit || [];
    const hasCompletedQuestionEvaluation = completedQuestionEvaluationCount > 0;
    const pageAnalysisAuditPassed = Boolean(
      originalPageCount > 0 &&
      pageAudit.length === originalPageCount &&
      Array.from({ length: originalPageCount }, (_, index) => index + 1).every((pageNumber) => {
        const page = pageAudit.find((item) => item.pageNumber === pageNumber);
        return Boolean(
          page &&
          page.analysisCompleted === true &&
          !page.analysisFailureCode &&
          !page.hasUnresolvedContent &&
          !page.mappingReviewReason &&
          (page.answerBlocksObserved === undefined ||
            page.answerBlocksObserved === page.accountedAnswerBlocks)
        );
      })
    );
    const physicalPageRenderPassed = Boolean(
      renderManifest?.isRenderValid === true &&
      renderManifest?.isAllPagesRendered === true &&
      renderManifest.totalPages === originalPageCount &&
      renderManifest.totalPagesRendered === originalPageCount &&
      Array.isArray(renderManifest.pages) &&
      renderManifest.pages.length === originalPageCount
    );
    const checkedCopyArtifactReady = checkedCopyStatus === 'READY';

    // A valid score is not enough: certification also requires (1) a completed
    // analysis disposition for every source page, (2) a saved checked copy, and
    // (3) physical render proof for every original page and attempted question.
    const renderCompletenessErrors = [
      ...(!hasCompletedQuestionEvaluation
        ? ['NO_QUESTION_LEVEL_EVALUATIONS: No question received a completed academic evaluation; score publication, Checked Copy and Detailed Report generation are withheld.']
        : []),
      ...(!pageAnalysisAuditPassed
        ? [`PAGE_ANALYSIS_COVERAGE_INCOMPLETE: ${pageAudit.filter((page) => page.analysisCompleted === true && !page.hasUnresolvedContent).length}/${originalPageCount} source pages have a complete, resolved analysis audit.`]
        : []),
      ...(!checkedCopyArtifactReady
        ? [`CHECKED_COPY_ARTIFACT_NOT_READY: Checked-copy artifact status is ${checkedCopyStatus}.`]
        : []),
      ...(!physicalPageRenderPassed
        ? [`PHYSICAL_PAGE_RENDER_INCOMPLETE: ${renderManifest?.totalPagesRendered ?? 0}/${originalPageCount} source pages have a verified physical render manifest.`]
        : []),
      ...(renderManifest?.renderErrors || []),
    ];

    // Check critical integrity: questions exist, ledger arithmetic is sound, no bounds violations
    const hasValidQuestions = Array.isArray(evaluationResult.questions) && evaluationResult.questions.length > 0;
    const isMathConsistent = consistencyReport.isValid && (!runPackage?.scoreLedger || runPackage.scoreLedger.isReconciled);
    const supervisorAuditStatus = (evaluationResult.integrityAudit as any)?.supervisor?.status;
    const supervisorApproved =
      !ENABLE_EVALUATION_SUPERVISOR ||
      supervisorAuditStatus === undefined ||
      supervisorAuditStatus === 'PASS';
    const evaluationValidationPassed = isEvaluationValidationSafeForCertification(evaluationResult.validationStatus);
    const criticalIntegrityPassed =
      hasValidQuestions &&
      hasCompletedQuestionEvaluation &&
      isMathConsistent &&
      evaluationValidationPassed &&
      supervisorApproved &&
      pageAnalysisAuditPassed &&
      checkedCopyArtifactReady &&
      physicalPageRenderPassed;

    let durablePackagePersisted = false;
    let finalStatus: 'COMPLETED' | 'NEEDS_REVIEW' = criticalIntegrityPassed ? 'COMPLETED' : 'NEEDS_REVIEW';
    let finalizationErrors: string[] = [];
    let reviewErrors: string[] = [];

    if (runPackage) {
      const packageToPersist = {
        ...runPackage,
        durablePersistenceConfirmed: true,
        finalizationStatus: criticalIntegrityPassed ? 'PERSISTED' as const : 'INTEGRITY_FAILED' as const,
      };
      evaluationResult.evaluationRunPackage = packageToPersist;
      try {
        persistEvaluationRunPackageAtomic(packageToPersist);
        durablePackagePersisted = true;
        console.log(`[AsyncEval] Durably persisted authoritative EvaluationRunPackage for ${evaluationId}`);
      } catch (persistErr: any) {
        console.warn(`[AsyncEval] Notice persisting EvaluationRunPackage for ${evaluationId}:`, persistErr.message);
      }

      if (criticalIntegrityPassed) {
        try {
          const finalizationResult = finalizeEvaluationRun({
            runPackage: evaluationResult.evaluationRunPackage!,
            evaluationId,
          });
          evaluationResult.evaluationRunPackage = finalizationResult.package;
          if (finalizationResult.success) {
            finalStatus = 'COMPLETED';
          } else {
            finalStatus = 'NEEDS_REVIEW';
            finalizationErrors = finalizationResult.errors || ['Evaluation finalization checks need review.'];
          }
        } catch (finErr: any) {
          console.warn(`[AsyncEval] Finalization run warning:`, finErr.message);
        }
      }
    }

    if (finalStatus === 'COMPLETED') {
      evaluationResult.validationStatus = 'VALID';
      evaluationResult.certificationStatus = 'CERTIFIED';
      evaluationResult.downloadsUnlocked = true;
      evaluationResult.academicScore = evaluationResult.canonicalLedger?.totalAwardedMarks ?? evaluationResult.totalMarks;
      evaluationResult.validationErrors = [];
      evaluationResult.completionGateReport = {
        passedCount: evaluationResult.completionGateReport?.passedCount ?? 12,
        failedCount: 0,
        checks: evaluationResult.completionGateReport?.checks || [],
        timestamp: new Date().toISOString(),
        isPassed: true,
      };
      evaluationResult.integrityAudit = {
        ...(evaluationResult.integrityAudit || {}),
        mathConsistent: true,
        hardCompletionGatePassed: true,
        errors: [],
      };
      console.log(`[AsyncEval] Evaluation ${evaluationId} automatically verified and CERTIFIED.`);
    } else {
      reviewErrors = Array.from(new Set([
        ...(!consistencyReport.isValid ? consistencyReport.errors : []),
        ...(evaluationResult.validationErrors || []),
        ...renderCompletenessErrors,
        ...finalizationErrors,
      ]));
      evaluationResult.validationStatus = 'NEEDS_REVIEW';
      evaluationResult.certificationStatus = 'REVIEW_REQUIRED';
      evaluationResult.downloadsUnlocked = false;
      evaluationResult.validationErrors = reviewErrors;
      evaluationResult.academicScore = evaluationResult.canonicalLedger?.totalAwardedMarks ?? evaluationResult.totalMarks;
      evaluationResult.completionGateReport = {
        ...(evaluationResult.completionGateReport || { passedCount: 0, failedCount: 0, checks: [], timestamp: new Date().toISOString() }),
        isPassed: false,
        failedCount: Math.max(1, reviewErrors.length),
      };
      evaluationResult.integrityAudit = {
        ...(evaluationResult.integrityAudit || {}),
        hardCompletionGatePassed: false,
        errors: reviewErrors,
      };
      console.info(`[AsyncEval] Evaluation ${evaluationId} status: NEEDS_REVIEW (${reviewErrors.length} critical validation items flagged)`);
    }

    // Reconcile the personal entitlement against the authoritative per-evaluation
    // ledger before publishing COMPLETED. Admin reprocessing can follow a prior
    // NEEDS_REVIEW refund; in that case the old job flag is stale and one debit
    // must be restored. An existing negative ledger entry prevents duplicates.
    if (
      finalStatus === 'COMPLETED' &&
      ['PROMO', 'PERSONAL_FREE', 'PERSONAL_PURCHASED_CREDIT'].includes(String(entitlementSource || '').toUpperCase())
    ) {
      const settlement = await settlePersonalEntitlementForSuccessfulEvaluation({
        userId: studentId,
        evaluationId,
        entitlementSource,
      });

      if (settlement?.charged) {
        successfulSettlementDebited = true;
        entitlementSource = settlement.source;
        console.info(
          `[AsyncEval] Settled ${settlement.source} entitlement for successful evaluation ${evaluationId} (${settlement.reason}).`
        );
      } else if (settlement) {
        entitlementSource = settlement.source;
        console.info(
          `[AsyncEval] Entitlement settlement for ${evaluationId} was not charged (${settlement.reason}).`
        );
      }

      if (settlement) {
        try {
          db.prepare(`
            INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details)
            VALUES (?, ?, ?, 'EVALUATION', ?, ?)
          `).run(
            `aud_${crypto.randomBytes(8).toString('hex')}`,
            studentId,
            settlement.source === 'PROMO' ? 'EVALUATION_COMPLETED_PROMO' : 'EVALUATION_COMPLETED_CREDIT',
            evaluationId,
            `Successful evaluation entitlement settlement: ${settlement.reason}; charged=${settlement.charged}.`
          );
        } catch (auditErr) {
          console.warn('[AsyncEval] Completion entitlement audit log failed:', auditErr);
        }
      }
    }

    const finalizationUpdate = db.prepare(`
      UPDATE evaluations
      SET status = ?,
          certification_status = ?,
          downloads_unlocked = ?,
          certified_at = CASE WHEN ? = 'COMPLETED' THEN COALESCE(certified_at, CURRENT_TIMESTAMP) ELSE certified_at END,
          progress_stage = ?,
          progress_percentage = 100,
          progress_message = ?,
          error_message = ?,
          rejection_reason = NULL,
          total_marks = ?,
          maximum_marks = ?,
          percentage = ?,
          grade = ?,
          confidence_score = ?,
          model_provider = ?,
          model_used = ?,
          original_model = ?,
          fallback_model = ?,
          retry_count = ?,
          prompt_tokens = ?,
          completion_tokens = ?,
          total_tokens = ?,
          latency_ms = ?,
          fallback_occurred = ?,
          fallback_reason = ?,
          result_json = ?,
          annotations_json = ?,
          original_page_count = ?,
          checked_copy_page_count = ?,
          checked_copy_status = ?,
          report_status = ?,
          mtp_series = COALESCE(?, mtp_series),
          pyq_source_format = COALESCE(?, pyq_source_format),
          normalized_package_json = ?,
          question_sources_json = ?,
          evaluation_run_package_id = COALESCE(?, evaluation_run_package_id),
          score_ledger_total = COALESCE(?, score_ledger_total),
          durable_persistence_confirmed = ?,
          completed_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND UPPER(COALESCE(status, '')) NOT IN ('COMPLETED', 'NEEDS_REVIEW', 'REJECTED', 'FAILED', 'PERSISTENCE_FAILED', 'CANCELLED')
    `).run(
      finalStatus,
      finalStatus === 'COMPLETED' ? 'CERTIFIED' : 'REVIEW_REQUIRED',
      finalStatus === 'COMPLETED' ? 1 : 0,
      finalStatus,
      finalStatus === 'COMPLETED' ? 'COMPLETED' : 'NEEDS_REVIEW',
      finalStatus === 'COMPLETED'
        ? 'Evaluation complete and certified'
        : 'Evaluation preserved. Academic score recorded; review required.',
      finalStatus === 'COMPLETED' ? null : (reviewErrors.join(' | ') || 'Evaluation preserved for academic review; no document rejection was made.'),
      evaluationResult.canonicalLedger?.totalAwardedMarks ?? evaluationResult.totalMarks,
      evaluationResult.maximumMarks,
      evaluationResult.percentage,
      evaluationResult.grade,
      evaluationResult.confidenceScore || (evaluationResult as any).overallConfidenceScore || 95.0,
      evaluationResult.modelProvider || 'gemini',
      evaluationResult.modelUsed || 'gemini-3.8-flash',
      evaluationResult.originalModel || 'gemini-3.8-flash',
      evaluationResult.fallbackModel || null,
      evaluationResult.retryCount || 0,
      evaluationResult.promptTokens || 0,
      evaluationResult.completionTokens || 0,
      evaluationResult.totalTokens || 0,
      evaluationResult.latencyMs || 0,
      evaluationResult.fallbackOccurred ? 1 : 0,
      evaluationResult.fallbackReason || null,
      JSON.stringify(evaluationResult),
      structuredAnnotationsJson,
      originalPageCount,
      checkedCopyStatus === 'READY' ? originalPageCount : 0,
      checkedCopyStatus,
      reportStatus,
      job.mtpSeries || null,
      job.sourceFormat || null,
      JSON.stringify({
        materialId: job.referenceMaterialId,
        title: job.referenceMaterialTitle,
        version: job.referenceMaterialVersion,
        materialType: job.materialType,
        sourceFormat: job.sourceFormat || 'SEPARATE',
        combinedSourceMaterialId: job.combinedSourceMaterialId,
        questionMaterialId: job.questionMaterialId,
        suggestedAnswerMaterialId: job.suggestedAnswerMaterialId,
        markingSchemeMaterialId: job.markingSchemeMaterialId,
      }),
      JSON.stringify((evaluationResult.questions || []).map(q => ({
        questionNumber: q.questionNumber,
        sources: (q as any).sources || {
          questionSourceId: job.sourceFormat === 'COMBINED' ? job.combinedSourceMaterialId : job.questionMaterialId,
          suggestedAnswerSourceId: job.sourceFormat === 'COMBINED' ? job.combinedSourceMaterialId : job.suggestedAnswerMaterialId,
          markingSchemeSourceId: job.markingSchemeMaterialId,
          sourceFormat: job.sourceFormat || 'SEPARATE',
        }
      }))),
      evaluationResult.evaluationRunPackage?.runId || null,
      evaluationResult.evaluationRunPackage?.scoreLedger?.totalAwardedMarks ?? evaluationResult.totalMarks,
      durablePackagePersisted ? 1 : 0,
      evaluationId
    );

    if (finalizationUpdate.changes !== 1) {
      const latestStatus = getEvaluationStatus(evaluationId);
      if (isTerminalEvaluationStatus(latestStatus)) {
        // Another terminal decision won after this worker restored a previously
        // refunded debit. Return only this worker's newly created debit unless
        // the competing worker successfully completed the same evaluation.
        if (latestStatus !== 'COMPLETED' && successfulSettlementDebited) {
          try {
            const restored = refundEvaluationCreditAtomic({
              userId: studentId,
              evaluationId,
              entitlementSource,
            });
            if (restored) {
              db.prepare('UPDATE evaluations SET consumed_from_personal_credits = 0 WHERE id = ?').run(evaluationId);
              await syncStudentCreditsToFirestore(studentId);
            }
          } catch (refundErr) {
            console.warn(`[AsyncEval] Could not refund a newly restored debit after terminal-state race for ${evaluationId}:`, refundErr);
          }
        }
        console.info(`[AsyncEval] Preserving terminal state ${latestStatus} for ${evaluationId}; stale job finalization was ignored.`);
        return;
      }
      throw new Error(`Could not finalize evaluation ${evaluationId}; current status is ${latestStatus || 'UNKNOWN'}.`);
    }

    // Every consented result becomes a learning observation after durable
    // evaluation finalization. NEEDS_REVIEW results are prioritised, not labels.
    try {
      await markParakhEvaluationCompleted({ evaluationId, evaluationStatus: finalStatus });
    } catch (parakhError) {
      console.warn(`[PARAKH] Could not register completed observation ${evaluationId}:`, parakhError);
    }

    if (finalStatus !== 'COMPLETED') {
      // The personal entitlement was charged when the upload was accepted.
      // Return it when the system could not produce a verified final result.
      if (
        job.creditAlreadyConsumed && !job.isRecoveryRetry &&
        (entitlementSource === 'PROMO' || entitlementSource === 'PERSONAL_FREE' || entitlementSource === 'PERSONAL_PURCHASED_CREDIT')
      ) {
        try {
          refundEvaluationCreditAtomic({ userId: studentId, evaluationId, entitlementSource });
          db.prepare('UPDATE evaluations SET consumed_from_personal_credits = 0 WHERE id = ?').run(evaluationId);
        } catch (refundErr) {
          console.error(`[AsyncEval] Refund error for review-required evaluation ${evaluationId}:`, refundErr);
        }
      }

      try {
        db.prepare(`
          INSERT INTO notifications (id, user_id, title, message, type)
          VALUES (?, ?, ?, ?, 'EVALUATION')
        `).run(
          `notif_${crypto.randomBytes(8).toString('hex')}`,
          studentId,
          'Evaluation Requires Review',
          `Your evaluation for ${subjectName} is preserved for review. No final score was issued.`,
        );
      } catch (notifErr) {
        console.warn('[AsyncEval] Error adding review notification:', notifErr);
      }

      try {
        const reviewEvalRow = db.prepare('SELECT * FROM evaluations WHERE id = ?').get(evaluationId);
        if (reviewEvalRow) syncRecordToFirestore('evaluations', evaluationId, reviewEvalRow as any);
      } catch (syncErr) {
        console.warn('[AsyncEval] Error syncing review-required evaluation to Firestore:', syncErr);
      }
      return;
    }

    // Stage 7: Institute-sponsored usage. Personal entitlements are settled
    // before the COMPLETED status is committed (see the completion settlement
    // immediately before finalizationUpdate).
    // Institute-sponsored usage is kept separate from personal entitlements.
    if (entitlementSource === 'INSTITUTE_ALLOCATION' && resolvedSponsoringInstituteId) {
      const idempotencyKey = `inst_eval_${evaluationId}`;
      const existingLedger = db.prepare('SELECT id FROM institute_usage_ledger WHERE idempotency_key = ?').get(idempotencyKey);
      if (!existingLedger) {
        db.prepare(`
          UPDATE institute_subscriptions
          SET evaluations_used = evaluations_used + 1,
              evaluations_remaining = MAX(0, evaluations_remaining - 1)
          WHERE institute_id = ? AND status = 'ACTIVE'
        `).run(resolvedSponsoringInstituteId);

        db.prepare(`
          INSERT INTO institute_usage_ledger (
            id, institute_id, student_id, evaluation_id, usage_type,
            evaluations_deducted, description, idempotency_key
          ) VALUES (?, ?, ?, ?, ?, 1, ?, ?)
        `).run(
          `usg_${crypto.randomBytes(8).toString('hex')}`,
          resolvedSponsoringInstituteId,
          studentId,
          evaluationId,
          requestedEvalSource === 'PUBLIC' ? 'STUDENT_PUBLIC_EVALUATION' : 'STUDENT_EVALUATION',
          `Sponsored ${requestedEvalSource} Evaluation (${subjectName}) for student`,
          idempotencyKey
        );

        db.prepare(`
          UPDATE evaluations
          SET consumed_from_institute_allocation = 1,
              consumed_from_personal_credits = 0
          WHERE id = ?
        `).run(evaluationId);

        db.prepare(`
          INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details)
          VALUES (?, ?, ?, 'EVALUATION', ?, ?)
        `).run(
          `aud_${crypto.randomBytes(8).toString('hex')}`,
          studentId,
          requestedEvalSource === 'PUBLIC' ? 'EVALUATION_PUBLIC_INSTITUTE_SPONSORED' : 'EVALUATION_INSTITUTE_SPONSORED',
          evaluationId,
          `1 evaluation credit deducted from sponsoring institute (${resolvedInstituteName || resolvedSponsoringInstituteId}). Personal credits untouched.`
        );
      }
    }
    // Stage 8: Student Notification
    try {
      db.prepare(`
        INSERT INTO notifications (id, user_id, title, message, type)
        VALUES (?, ?, ?, ?, 'EVALUATION')
      `).run(
        `notif_${crypto.randomBytes(8).toString('hex')}`,
        studentId,
        'Answer Sheet Evaluation Complete',
        `Your evaluation for ${subjectName} is complete. You scored ${evaluationResult.totalMarks}/${evaluationResult.maximumMarks} (${evaluationResult.percentage}%).`
      );
    } catch (notifErr) {
      console.warn('[AsyncEval] Error adding completion notification:', notifErr);
    }

    // Stage 9: Sync completed evaluation to Cloud Firestore
    try {
      const completedEvalRow = db.prepare('SELECT * FROM evaluations WHERE id = ?').get(evaluationId);
      if (completedEvalRow) {
        syncRecordToFirestore('evaluations', evaluationId, completedEvalRow as any);
      }
    } catch (syncErr) {
      console.warn('[AsyncEval] Error syncing completed evaluation to Firestore:', syncErr);
    }

    console.log(`[AsyncEval] Successfully completed evaluation ${evaluationId} (${evaluationResult.totalMarks}/${evaluationResult.maximumMarks} marks)`);
  } catch (error: unknown) {
    console.error(`[AsyncEval] Evaluation failed for ${evaluationId}:`, error);

    const errMsg = error instanceof Error ? error.message : 'Evaluation processing encountered an unexpected issue.';
    const currentStatus = getEvaluationStatus(evaluationId);
    if (isTerminalEvaluationStatus(currentStatus)) {
      // Preserve the terminal evaluation state, but reconcile any entitlement
      // left debited by an earlier/competing failure path. The credit ledger makes
      // this safe to call repeatedly and refuses refunds without a matching debit.
      if (
        currentStatus !== 'COMPLETED' &&
        (successfulSettlementDebited || !job.isRecoveryRetry) &&
        (entitlementSource === 'PROMO' || entitlementSource === 'PERSONAL_FREE' || entitlementSource === 'PERSONAL_PURCHASED_CREDIT')
      ) {
        try {
          const restored = refundEvaluationCreditAtomic({ userId: studentId, evaluationId, entitlementSource });
          if (restored) {
            db.prepare('UPDATE evaluations SET consumed_from_personal_credits = 0 WHERE id = ?').run(evaluationId);
            await syncStudentCreditsToFirestore(studentId);
          }
        } catch (refundErr) {
          console.warn(`[AsyncEval] Terminal-state entitlement repair failed for ${evaluationId} (${currentStatus}):`, refundErr);
        }
      }
      console.info(`[AsyncEval] Preserving terminal status ${currentStatus} for ${evaluationId}; no stale status mutation applied.`);
      return;
    }

    // Claim the failure transition before refunding. If another request rejects or
    // completes the evaluation concurrently, this compare-and-set prevents mutation.
    const failureUpdate = db.prepare(`
      UPDATE evaluations
      SET status = 'FAILED',
          progress_stage = 'FAILED',
          progress_percentage = 0,
          progress_message = ?,
          error_message = ?,
          completed_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND UPPER(COALESCE(status, '')) NOT IN ('COMPLETED', 'NEEDS_REVIEW', 'REJECTED', 'FAILED', 'PERSISTENCE_FAILED', 'CANCELLED')
    `).run(errMsg.slice(0, 500), errMsg.slice(0, 500), evaluationId);

    if (failureUpdate.changes !== 1) {
      const latestStatus = getEvaluationStatus(evaluationId);
      if (isTerminalEvaluationStatus(latestStatus)) {
        if (
          latestStatus !== 'COMPLETED' &&
          (successfulSettlementDebited || !job.isRecoveryRetry) &&
          (entitlementSource === 'PROMO' || entitlementSource === 'PERSONAL_FREE' || entitlementSource === 'PERSONAL_PURCHASED_CREDIT')
        ) {
          try {
            const restored = refundEvaluationCreditAtomic({ userId: studentId, evaluationId, entitlementSource });
            if (restored) {
              db.prepare('UPDATE evaluations SET consumed_from_personal_credits = 0 WHERE id = ?').run(evaluationId);
              await syncStudentCreditsToFirestore(studentId);
            }
          } catch (refundErr) {
            console.warn(`[AsyncEval] Failure-claim race entitlement repair failed for ${evaluationId}:`, refundErr);
          }
        }
        console.info(`[AsyncEval] Preserving terminal status ${latestStatus} for ${evaluationId} after failure-claim race.`);
        return;
      }
      console.error(`[AsyncEval] Could not claim failure status for ${evaluationId}; status is now ${latestStatus || 'UNKNOWN'}.`);
      return;
    }

    try {
      await markParakhEvaluationFailed(evaluationId);
    } catch (parakhError) {
      console.warn(`[PARAKH] Could not exclude failed evaluation ${evaluationId}:`, parakhError);
    }

    await releaseFacultyMockCopyAccessForFailedEvaluation(evaluationId);

    // Refund only after successfully recording this job's FAILED transition.
    if ((successfulSettlementDebited || (job.creditAlreadyConsumed && !job.isRecoveryRetry)) && (entitlementSource === 'PROMO' || entitlementSource === 'PERSONAL_FREE' || entitlementSource === 'PERSONAL_PURCHASED_CREDIT')) {
      try {
        const restored = refundEvaluationCreditAtomic({
          userId: studentId,
          evaluationId,
          entitlementSource,
        });
        if (restored) {
          db.prepare('UPDATE evaluations SET consumed_from_personal_credits = 0 WHERE id = ?').run(evaluationId);
          await syncStudentCreditsToFirestore(studentId);
        }
      } catch (refundErr) {
        console.warn(`[AsyncEval] Refund error for ${evaluationId}:`, refundErr);
      }
    }

    try {
      const failedRow = db.prepare('SELECT * FROM evaluations WHERE id = ?').get(evaluationId) as any;
      if (failedRow) await syncRecordToFirestore('evaluations', evaluationId, failedRow);
    } catch (syncErr) {
      console.warn(`[AsyncEval] Could not sync failed evaluation ${evaluationId}:`, syncErr);
    }
  } finally {
    // Active-job ownership is released by the queue runner so its durable lease
    // remains held until status settlement has been written to Firestore.
  }
}

/**
 * Safely enqueues an evaluation job to run asynchronously in the background.
 * Returns immediately without blocking the caller.
 */
export async function enqueueEvaluation(job: EvaluationJobData): Promise<void> {
  if (activeJobs.has(job.evaluationId) || durableQueueStartingJobs.has(job.evaluationId)) {
    console.log(`[AsyncEval] Evaluation ${job.evaluationId} is already running in background.`);
    return;
  }

  if (isProductionEvaluationQueue()) {
    // Do not acknowledge a job until its original input is verified in Cloud Storage
    // and its metadata is durably written to Firestore.
    const sourceUploadFileId = await ensureDurableOriginalFiles(job);
    const persisted = await persistDurableEvaluationQueueRecord(job, sourceUploadFileId);
    if (!persisted) {
      // A duplicate enqueue for the same evaluation is already safely represented
      // by an existing QUEUED/RUNNING durable job. Treat it as accepted without
      // resetting progress or creating another worker.
      console.log(`[DurableEvalQueue] Existing live queue record retained for ${job.evaluationId}.`);
      return;
    }
    updateEvaluationProgress(
      job.evaluationId,
      'QUEUED',
      'QUEUED',
      5,
      'Evaluation job durably queued. Starting processing pipeline...'
    );
    await processDurableEvaluationQueue(job.evaluationId, job);
    return;
  }

  updateEvaluationProgress(
    job.evaluationId,
    'QUEUED',
    'QUEUED',
    5,
    'Evaluation job safely queued. Starting processing pipeline...'
  );

  // Local/test development keeps the lightweight in-memory worker.
  const promise = (async () => {
    try {
      await executeEvaluationJob(job);
    } catch (err) {
      console.error(`[AsyncEval] Unhandled error in background evaluation ${job.evaluationId}:`, err);
    } finally {
      activeJobs.delete(job.evaluationId);
    }
  })();
  activeJobs.set(job.evaluationId, promise);
}
