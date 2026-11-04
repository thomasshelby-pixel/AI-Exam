import crypto from 'node:crypto';
import {
  getFirestoreDoc,
  runFirestoreTransaction,
} from './firestoreDbService.js';

const FREE_COPY_COLLECTION = 'faculty_mock_free_uses';
const PAID_COPY_COLLECTION = 'faculty_mock_paid_copy_ledgers';

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
  return runFirestoreTransaction(async (transaction) => {
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
}

export async function releaseFacultyMockFreeCopy(
  studentId: string,
  facultyMockTestId: string,
  evaluationId: string,
): Promise<void> {
  const id = studentMockLedgerId(studentId, facultyMockTestId);
  await runFirestoreTransaction(async (transaction) => {
    const snapshot = await transaction.get(FREE_COPY_COLLECTION, id);
    const existing = snapshot.data() as FacultyMockFreeCopyClaim | undefined;
    if (snapshot.exists && String(existing?.evaluationId || '') === evaluationId) {
      transaction.delete(FREE_COPY_COLLECTION, id);
    }
  });
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
  await runFirestoreTransaction(async (transaction) => {
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
  });
}

/**
 * Returns the newest available paid copy for retry recovery after a successful
 * payment when the browser was closed before its evaluation submission finished.
 */
export async function findAvailableFacultyMockPaidCopy(
  studentId: string,
  facultyMockTestId: string,
): Promise<string | null> {
  const id = studentMockLedgerId(studentId, facultyMockTestId);
  const ledger = await getFirestoreDoc<PaidCopyLedger>(PAID_COPY_COLLECTION, id, { failOnError: true });
  if (!ledger || ledger.studentId !== studentId || ledger.facultyMockTestId !== facultyMockTestId) return null;
  const available = Object.values(ledger.copies || {})
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
  return runFirestoreTransaction(async (transaction) => {
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
}

export async function releaseFacultyMockPaidCopy(
  orderId: string,
  studentId: string,
  facultyMockTestId: string,
  evaluationId: string,
): Promise<void> {
  const id = studentMockLedgerId(studentId, facultyMockTestId);
  const now = new Date().toISOString();
  await runFirestoreTransaction(async (transaction) => {
    const snapshot = await transaction.get(PAID_COPY_COLLECTION, id);
    const ledger = snapshot.data() as PaidCopyLedger | undefined;
    if (!snapshot.exists || ledger?.studentId !== studentId || ledger?.facultyMockTestId !== facultyMockTestId) return;

    const copies = { ...(ledger.copies || {}) };
    const copy = copies[orderId];
    if (!copy || copy.status !== 'CONSUMED' || copy.evaluationId !== evaluationId) return;
    copies[orderId] = {
      ...copy,
      status: 'AVAILABLE',
      evaluationId: null,
      consumedAt: null,
    };
    transaction.set(PAID_COPY_COLLECTION, id, { ...ledger, copies, updatedAt: now });
  });
}
