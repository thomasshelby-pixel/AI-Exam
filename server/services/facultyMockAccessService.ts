import crypto from 'node:crypto';
import {
  getFirestoreDoc,
  runFirestoreTransaction,
  setFirestoreDoc,
} from './firestoreDbService.js';

const SETTINGS_COLLECTION = 'faculty_mock_settings';
const ACCESS_COLLECTION = 'faculty_mock_access';
const PAYMENT_GRANTS_COLLECTION = 'faculty_mock_payment_grants';
const EVALUATION_CLAIMS_COLLECTION = 'faculty_mock_evaluation_claims';

function stableId(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export type FacultyMockCopyDecision = 'FREE_FIRST_COPY' | 'PAID_REPEAT_COPY' | 'PAYMENT_REQUIRED';

export function decideFacultyMockCopy(input: {
  freeCopyUsed: boolean;
  paidCopiesRemaining: number;
}): FacultyMockCopyDecision {
  if (!input.freeCopyUsed) return 'FREE_FIRST_COPY';
  if (Number.isFinite(input.paidCopiesRemaining) && input.paidCopiesRemaining >= 1) return 'PAID_REPEAT_COPY';
  return 'PAYMENT_REQUIRED';
}

export interface FacultyMockAccessState {
  freeCopyAvailable: boolean;
  paidCopiesRemaining: number;
  repeatPriceINR: number | null;
}

export async function getFacultyMockRepeatPrice(): Promise<number | null> {
  const setting = await getFirestoreDoc<Record<string, unknown>>(SETTINGS_COLLECTION, 'repeat_copy_price');
  const price = Number(setting?.price_inr);
  return Number.isSafeInteger(price) && price >= 1 && price <= 10000 ? price : null;
}

export async function setFacultyMockRepeatPrice(priceINR: number, actorId: string): Promise<number> {
  if (!Number.isSafeInteger(priceINR) || priceINR < 1 || priceINR > 10000) {
    throw new Error('Repeat-copy price must be a whole amount between ₹1 and ₹10,000.');
  }
  const saved = await setFirestoreDoc(SETTINGS_COLLECTION, 'repeat_copy_price', {
    id: 'repeat_copy_price',
    price_inr: priceINR,
    updated_by: actorId,
    updated_at: new Date().toISOString(),
  });
  if (!saved) throw new Error('Could not save faculty mock pricing to the shared database.');
  return priceINR;
}

export async function getFacultyMockAccessState(
  studentId: string,
  facultyId: string,
  testId: string,
): Promise<FacultyMockAccessState> {
  const key = stableId(`${studentId}:${facultyId}:${testId}`);
  const [access, repeatPriceINR] = await Promise.all([
    getFirestoreDoc<Record<string, unknown>>(ACCESS_COLLECTION, key),
    getFacultyMockRepeatPrice(),
  ]);
  return {
    freeCopyAvailable: access?.free_copy_used !== true,
    paidCopiesRemaining: Math.max(0, Math.floor(Number(access?.paid_copies_remaining) || 0)),
    repeatPriceINR,
  };
}

/**
 * Adds one paid copy entitlement for a verified Razorpay payment.
 * The receipt and balance update are in one Firestore transaction, so a
 * duplicate checkout callback or webhook cannot grant the same paid copy twice.
 */
export async function grantFacultyMockPaidCopy(input: {
  studentId: string;
  facultyId: string;
  testId: string;
  orderId: string;
  paymentId: string;
  amountPaise: number;
}): Promise<{ alreadyGranted: boolean; paidCopiesRemaining: number }> {
  const accessId = stableId(`${input.studentId}:${input.facultyId}:${input.testId}`);
  const receiptId = stableId(input.orderId);
  const result = await runFirestoreTransaction(async (transaction) => {
    const receipt = await transaction.get(PAYMENT_GRANTS_COLLECTION, receiptId);
    const accessSnapshot = await transaction.get(ACCESS_COLLECTION, accessId);
    const access = accessSnapshot.exists ? (accessSnapshot.data() || {}) : {};
    const currentBalance = Math.max(0, Math.floor(Number(access.paid_copies_remaining) || 0));
    if (receipt.exists) {
      return { alreadyGranted: true, paidCopiesRemaining: currentBalance };
    }
    const nextBalance = currentBalance + 1;
    transaction.set(ACCESS_COLLECTION, accessId, {
      ...access,
      student_id: input.studentId,
      faculty_id: input.facultyId,
      faculty_mock_test_id: input.testId,
      paid_copies_remaining: nextBalance,
      updated_at: new Date().toISOString(),
    });
    transaction.set(PAYMENT_GRANTS_COLLECTION, receiptId, {
      id: receiptId,
      order_id: input.orderId,
      payment_id: input.paymentId,
      student_id: input.studentId,
      faculty_id: input.facultyId,
      faculty_mock_test_id: input.testId,
      amount_paise: input.amountPaise,
      granted_at: new Date().toISOString(),
    });
    return { alreadyGranted: false, paidCopiesRemaining: nextBalance };
  });
  if (!result || typeof result.paidCopiesRemaining !== 'number') {
    throw new Error('Could not confirm faculty mock payment credit in the shared database.');
  }
  return result;
}

/**
 * Called only after the uploaded answer sheet passes document and subject checks.
 * The first accepted copy is free for each student + faculty + mock combination.
 * Every later accepted copy consumes exactly one separately purchased mock credit.
 */
export async function consumeFacultyMockCopy(input: {
  studentId: string;
  facultyId: string;
  testId: string;
  evaluationId: string;
}): Promise<{ source: 'FREE_FIRST_COPY' | 'PAID_REPEAT_COPY'; paidCopiesRemaining: number }> {
  const accessId = stableId(`${input.studentId}:${input.facultyId}:${input.testId}`);
  const claimId = stableId(`${input.studentId}:${input.testId}:${input.evaluationId}`);
  const result = await runFirestoreTransaction<{ source: 'FREE_FIRST_COPY' | 'PAID_REPEAT_COPY'; paidCopiesRemaining: number }>(async (transaction) => {
    const claim = await transaction.get(EVALUATION_CLAIMS_COLLECTION, claimId);
    const accessSnapshot = await transaction.get(ACCESS_COLLECTION, accessId);
    const access = accessSnapshot.exists ? (accessSnapshot.data() || {}) : {};
    const paidBalance = Math.max(0, Math.floor(Number(access.paid_copies_remaining) || 0));
    if (claim.exists) {
      const source: 'FREE_FIRST_COPY' | 'PAID_REPEAT_COPY' = String(claim.data()?.source || 'FREE_FIRST_COPY') === 'PAID_REPEAT_COPY' ? 'PAID_REPEAT_COPY' : 'FREE_FIRST_COPY';
      return { source, paidCopiesRemaining: paidBalance };
    }

    const decision = decideFacultyMockCopy({
      freeCopyUsed: access.free_copy_used === true,
      paidCopiesRemaining: paidBalance,
    });
    if (decision === 'PAYMENT_REQUIRED') {
      const error = new Error('This mock’s free copy has already been used. Purchase one repeat copy to evaluate another answer sheet.');
      (error as Error & { code?: string }).code = 'FACULTY_MOCK_PAYMENT_REQUIRED';
      throw error;
    }
    const source = decision;
    const nextBalance = source === 'PAID_REPEAT_COPY' ? paidBalance - 1 : paidBalance;

    transaction.set(ACCESS_COLLECTION, accessId, {
      ...access,
      student_id: input.studentId,
      faculty_id: input.facultyId,
      faculty_mock_test_id: input.testId,
      free_copy_used: true,
      free_copy_evaluation_id: source === 'FREE_FIRST_COPY' ? input.evaluationId : (access.free_copy_evaluation_id || null),
      paid_copies_remaining: nextBalance,
      updated_at: new Date().toISOString(),
    });
    transaction.set(EVALUATION_CLAIMS_COLLECTION, claimId, {
      id: claimId,
      evaluation_id: input.evaluationId,
      student_id: input.studentId,
      faculty_id: input.facultyId,
      faculty_mock_test_id: input.testId,
      source,
      claimed_at: new Date().toISOString(),
    });
    return { source, paidCopiesRemaining: nextBalance };
  });
  if (!result || (result.source !== 'FREE_FIRST_COPY' && result.source !== 'PAID_REPEAT_COPY')) {
    throw new Error('Could not confirm faculty mock copy entitlement in the shared database.');
  }
  return result;
}
