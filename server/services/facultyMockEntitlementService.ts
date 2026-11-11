import crypto from 'node:crypto';
import {
  getFirestoreDoc,
  queryFirestoreDocs,
  runFirestoreTransaction,
} from './firestoreDbService.js';

const FREE_COPY_COLLECTION = 'faculty_mock_free_uses';
const PAID_COPY_COLLECTION = 'faculty_mock_paid_copy_ledgers';

const REVIEW_RETRY_COLLECTION = 'faculty_mock_review_retries';

function reviewRetryLedgerId(studentId: string, facultyMockTestId: string, previousEvaluationId: string): string {
  return crypto
    .createHash('sha256')
    .update(`${String(studentId).trim()}\\0${String(facultyMockTestId).trim()}\\0${String(previousEvaluationId).trim()}`)
    .digest('hex');
}

export interface FacultyMockReviewRetryClaim {
  id: string;
  studentId: string;
  facultyMockTestId: string;
  previousEvaluationId: string;
  retryEvaluationId: string;
  createdAt: string;
}

export function isEligibleFacultyMockReviewRetry(
  previousEvaluation: any,
  studentId: string,
  facultyMockTestId: string,
): boolean {
  return Boolean(
    previousEvaluation &&
    String(previousEvaluation.student_id || '') === String(studentId) &&
    String(previousEvaluation.status || '').toUpperCase() === 'NEEDS_REVIEW' &&
    String(previousEvaluation.evaluation_source || '').toUpperCase() === 'FACULTY_MOCK' &&
    String(previousEvaluation.material_type || '').toUpperCase() === 'FACULTY_MOCK_TEST' &&
    String(previousEvaluation.faculty_mock_test_id || '') === String(facultyMockTestId) &&
    String(previousEvaluation.answer_sheet_sha256 || '').trim() &&
    !String(previousEvaluation.retry_of_evaluation_id || '').trim() &&
    !String(previousEvaluation.faculty_mock_review_retry_evaluation_id || '').trim()
  );
}

/**
 * Returns true only when a NEEDS_REVIEW evaluation still has its one-time
 * same-copy retry available. The Firestore retry ledger is authoritative
 * across App Hosting instances; a local evaluation row alone cannot decide it.
 */
export async function hasPendingFacultyMockReviewRetry(
  evaluations: any[],
  facultyMockTestId: string,
): Promise<boolean> {
  const byId = new Map<string, any>();
  for (const evaluation of evaluations || []) {
    const id = String(evaluation?.id || '').trim();
    if (id) byId.set(id, evaluation);
  }

  const candidates = [...byId.values()].filter((evaluation) =>
    isEligibleFacultyMockReviewRetry(
      evaluation,
      String(evaluation.student_id || ''),
      facultyMockTestId,
    )
  );

  if (candidates.length === 0) return false;

  // One indexed collection query replaces one document read per NEEDS_REVIEW row.
  const claims = await queryFirestoreDocs<FacultyMockReviewRetryClaim>(
    REVIEW_RETRY_COLLECTION,
    [{ field: 'facultyMockTestId', op: '==', value: facultyMockTestId }],
    { failOnError: true },
  );
  const claimedPreviousEvaluationIds = new Set(
    claims.map((claim) => String(claim.previousEvaluationId || '').trim()).filter(Boolean)
  );

  return candidates.some((evaluation) =>
    !claimedPreviousEvaluationIds.has(String(evaluation.id))
  );
}

export function isExactFacultyMockReviewRetryCopy(
  previousSha256: unknown,
  submittedSha256: unknown,
): boolean {
  const previous = String(previousSha256 || '').trim().toLowerCase();
  const submitted = String(submittedSha256 || '').trim().toLowerCase();
  return Boolean(previous && submitted && /^[a-f0-9]{64}$/.test(previous) && previous === submitted);
}

/**
 * Allows exactly one no-charge retry of the same Faculty Mock answer sheet after
 * NEEDS_REVIEW. The Firestore transaction is authoritative across app instances.
 */
export async function claimFacultyMockReviewRetry(
  studentId: string,
  facultyMockTestId: string,
  previousEvaluationId: string,
  retryEvaluationId: string,
): Promise<boolean> {
  const id = reviewRetryLedgerId(studentId, facultyMockTestId, previousEvaluationId);
  const now = new Date().toISOString();
  const claimed = await runFirestoreTransaction(async (transaction) => {
    const snapshot = await transaction.get(REVIEW_RETRY_COLLECTION, id);
    const existing = snapshot.data() as FacultyMockReviewRetryClaim | undefined;
    if (snapshot.exists) {
      return String(existing?.retryEvaluationId || '') === retryEvaluationId;
    }
    transaction.set(REVIEW_RETRY_COLLECTION, id, {
      id,
      studentId,
      facultyMockTestId,
      previousEvaluationId,
      retryEvaluationId,
      createdAt: now,
    });
    return true;
  });
  if (typeof claimed !== 'boolean') {
    throw new Error('Firestore did not confirm the Faculty Mock review-retry reservation.');
  }
  return claimed;
}

/** Release only the reservation created by this unaccepted retry submission. */
export async function releaseFacultyMockReviewRetry(
  studentId: string,
  facultyMockTestId: string,
  previousEvaluationId: string,
  retryEvaluationId: string,
): Promise<void> {
  const id = reviewRetryLedgerId(studentId, facultyMockTestId, previousEvaluationId);
  const released = await runFirestoreTransaction(async (transaction) => {
    const snapshot = await transaction.get(REVIEW_RETRY_COLLECTION, id);
    const existing = snapshot.data() as FacultyMockReviewRetryClaim | undefined;
    if (snapshot.exists && String(existing?.retryEvaluationId || '') === retryEvaluationId) {
      transaction.delete(REVIEW_RETRY_COLLECTION, id);
    }
    return true;
  });
  if (released !== true) throw new Error('Firestore did not confirm the Faculty Mock review-retry release.');
}

function studentMockLedgerId(studentId: string, facultyMockTestId: string): string {
  return crypto
    .createHash('sha256')
    .update(`${String(studentId).trim()}\0${String(facultyMockTestId).trim()}`)
    .digest('hex');
}

export interface FacultyMockFreeCopyClaim {
  id: string;
  studentId: string;
  facultyMockTestId: string;
  evaluationId: string;
  createdAt: string;
}

/**
 * Reads the authoritative free-copy reservation from Firestore.
 * SQLite tables remain a local cache only; they are never used to grant another
 * free copy when a request lands on a different App Hosting instance.
 */
export async function getFacultyMockFreeCopyClaim(
  studentId: string,
  facultyMockTestId: string,
): Promise<FacultyMockFreeCopyClaim | null> {
  const id = studentMockLedgerId(studentId, facultyMockTestId);
  const document = await getFirestoreDoc<FacultyMockFreeCopyClaim>(FREE_COPY_COLLECTION, id, { failOnError: true });
  return document || null;
}

/**
 * Atomically reserves the one free copy for the exact student + mock pair.
 * Returns true only for the first claim or an idempotent retry of that same
 * evaluation ID. Concurrent requests on different instances cannot both win.
 */
export async function claimFacultyMockFreeCopy(
  studentId: string,
  facultyMockTestId: string,
  evaluationId: string,
): Promise<boolean> {
  const id = studentMockLedgerId(studentId, facultyMockTestId);
  const now = new Date().toISOString();
  const result = await runFirestoreTransaction(async (transaction) => {
    const snapshot = await transaction.get(FREE_COPY_COLLECTION, id);
    const existing = snapshot.data() as FacultyMockFreeCopyClaim | undefined;
    if (snapshot.exists) {
      return String(existing?.evaluationId || '') === evaluationId;
    }
    transaction.set(FREE_COPY_COLLECTION, id, {
      id,
      studentId,
      facultyMockTestId,
      evaluationId,
      createdAt: now,
    });
    return true;
  });
  if (typeof result !== 'boolean') {
    throw new Error('Firestore did not confirm the Faculty Mock free-copy reservation.');
  }
  return result;
}

export async function releaseFacultyMockFreeCopy(
  studentId: string,
  facultyMockTestId: string,
  evaluationId: string,
): Promise<void> {
  const id = studentMockLedgerId(studentId, facultyMockTestId);
  const released = await runFirestoreTransaction(async (transaction) => {
    const snapshot = await transaction.get(FREE_COPY_COLLECTION, id);
    const existing = snapshot.data() as FacultyMockFreeCopyClaim | undefined;
    if (snapshot.exists && String(existing?.evaluationId || '') === evaluationId) {
      transaction.delete(FREE_COPY_COLLECTION, id);
    }
    return true;
  });
  if (released !== true) throw new Error('Firestore did not confirm the Faculty Mock free-copy release.');
}

interface PaidCopyEntry {
  orderId: string;
  status: 'AVAILABLE' | 'CONSUMED';
  evaluationId: string | null;
  createdAt: string;
  consumedAt?: string | null;
}

interface PaidCopyLedger {
  id: string;
  studentId: string;
  facultyMockTestId: string;
  copies: Record<string, PaidCopyEntry>;
  updatedAt: string;
}

/**
 * Records a successful Razorpay payment in the shared Firestore ledger.
 * Replays of the same captured order are idempotent.
 */
export async function grantFacultyMockPaidCopy(
  orderId: string,
  studentId: string,
  facultyMockTestId: string,
): Promise<void> {
  const id = studentMockLedgerId(studentId, facultyMockTestId);
  const now = new Date().toISOString();
  const saved = await runFirestoreTransaction(async (transaction) => {
    const snapshot = await transaction.get(PAID_COPY_COLLECTION, id);
    const existing = snapshot.data() as PaidCopyLedger | undefined;
    if (snapshot.exists && (
      existing?.studentId !== studentId ||
      existing?.facultyMockTestId !== facultyMockTestId
    )) {
      throw new Error('Faculty Mock paid-copy ledger identity mismatch.');
    }

    const copies = { ...(existing?.copies || {}) };
    if (!copies[orderId]) {
      copies[orderId] = {
        orderId,
        status: 'AVAILABLE',
        evaluationId: null,
        createdAt: now,
        consumedAt: null,
      };
    }
    transaction.set(PAID_COPY_COLLECTION, id, {
      id,
      studentId,
      facultyMockTestId,
      copies,
      updatedAt: now,
    });
    return true;
  });
  if (saved !== true) throw new Error('Firestore did not confirm the paid Faculty Mock copy grant.');
}

/**
 * Returns the newest available paid copy for retry recovery after a successful
 * payment when the browser was closed before its evaluation submission finished.
 */
export async function findAvailableFacultyMockPaidCopy(
  studentId: string,
  facultyMockTestId: string,
  preferredOrderId?: string,
): Promise<string | null> {
  const id = studentMockLedgerId(studentId, facultyMockTestId);
  const ledger = await getFirestoreDoc<PaidCopyLedger>(PAID_COPY_COLLECTION, id, { failOnError: true });
  if (!ledger || ledger.studentId !== studentId || ledger.facultyMockTestId !== facultyMockTestId) return null;
  const copies = Object.values(ledger.copies || {});
  if (preferredOrderId) {
    return copies.find((copy) => copy.orderId === preferredOrderId && copy.status === 'AVAILABLE')?.orderId || null;
  }
  const available = copies
    .filter((copy) => copy.status === 'AVAILABLE')
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return available[0]?.orderId || null;
}

/**
 * Atomically consumes exactly one paid copy. A single captured Razorpay order
 * cannot fund two evaluations, including requests served by different instances.
 */
export async function consumeFacultyMockPaidCopy(
  orderId: string,
  studentId: string,
  facultyMockTestId: string,
  evaluationId: string,
): Promise<boolean> {
  const id = studentMockLedgerId(studentId, facultyMockTestId);
  const now = new Date().toISOString();
  const consumed = await runFirestoreTransaction(async (transaction) => {
    const snapshot = await transaction.get(PAID_COPY_COLLECTION, id);
    const ledger = snapshot.data() as PaidCopyLedger | undefined;
    if (!snapshot.exists || ledger?.studentId !== studentId || ledger?.facultyMockTestId !== facultyMockTestId) {
      return false;
    }
    const copies = { ...(ledger.copies || {}) };
    const copy = copies[orderId];
    if (!copy) return false;
    if (copy.status === 'CONSUMED') return copy.evaluationId === evaluationId;
    if (copy.status !== 'AVAILABLE') return false;

    copies[orderId] = {
      ...copy,
      status: 'CONSUMED',
      evaluationId,
      consumedAt: now,
    };
    transaction.set(PAID_COPY_COLLECTION, id, { ...ledger, copies, updatedAt: now });
    return true;
  });
  if (typeof consumed !== 'boolean') {
    throw new Error('Firestore did not confirm the paid Faculty Mock copy consumption.');
  }
  return consumed;
}

export async function releaseFacultyMockPaidCopy(
  orderId: string,
  studentId: string,
  facultyMockTestId: string,
  evaluationId: string,
): Promise<void> {
  const id = studentMockLedgerId(studentId, facultyMockTestId);
  const now = new Date().toISOString();
  const released = await runFirestoreTransaction(async (transaction) => {
    const snapshot = await transaction.get(PAID_COPY_COLLECTION, id);
    const ledger = snapshot.data() as PaidCopyLedger | undefined;
    if (!snapshot.exists || ledger?.studentId !== studentId || ledger?.facultyMockTestId !== facultyMockTestId) return true;

    const copies = { ...(ledger.copies || {}) };
    const copy = copies[orderId];
    if (!copy || copy.status !== 'CONSUMED' || copy.evaluationId !== evaluationId) return true;
    copies[orderId] = {
      ...copy,
      status: 'AVAILABLE',
      evaluationId: null,
      consumedAt: null,
    };
    transaction.set(PAID_COPY_COLLECTION, id, { ...ledger, copies, updatedAt: now });
    return true;
  });
  if (released !== true) throw new Error('Firestore did not confirm the paid Faculty Mock copy release.');
}
