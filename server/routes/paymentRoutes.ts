import { Router, Request, Response } from 'express';
import { authenticateToken, AuthRequest } from '../auth.js';
import { paymentOrderRateLimiter } from '../utils/rateLimiter.js';
import { db } from '../db.js';
import { getFirestoreDoc } from '../services/firestoreDbService.js';
import { getFacultyMockAccessState } from '../services/facultyMockAccessService.js';
import { checkComboPurchaseCourseAccess } from '../services/studentCourseAccessService.js';
import {
  createRazorpayOrder,
  verifyAndFulfillPayment,
  processRazorpayWebhook,
  isRazorpayConfigured,
  getRazorpayKeyId,
} from '../razorpay.js';

const router = Router();

// Create Razorpay Order
router.post('/create-order', authenticateToken, paymentOrderRateLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const studentId = req.user!.id;
    const { purchaseType, courseLevel } = req.body;

    let orderResult;
    if (purchaseType === 'FACULTY_MOCK') {
      if (req.user!.role !== 'STUDENT') {
        return res.status(403).json({ error: 'Faculty mock repeat copies are available to student accounts only.' });
      }
      const testId = String(req.body?.facultyMockTestId || '').trim();
      if (!testId) return res.status(400).json({ error: 'Select a faculty mock before purchasing a repeat copy.' });
      const test = await getFirestoreDoc<any>('faculty_mock_tests', testId)
        || db.prepare('SELECT * FROM faculty_mock_tests WHERE id = ?').get(testId) as any;
      if (!test || String(test.status || '').toUpperCase() !== 'PUBLISHED') {
        return res.status(404).json({ error: 'This faculty mock is no longer published.' });
      }
      const profile = db.prepare('SELECT ca_level FROM student_profiles WHERE user_id = ?').get(studentId) as { ca_level?: string } | undefined;
      if (String(profile?.ca_level || '').trim().toUpperCase() !== String(test.course_level || '').trim().toUpperCase()) {
        return res.status(403).json({ error: 'This faculty mock does not match your registered CA course.' });
      }
      const faculty = await getFirestoreDoc<any>('faculty_mock_faculties', String(test.faculty_id))
        || db.prepare('SELECT * FROM faculty_mock_faculties WHERE id = ?').get(test.faculty_id) as any;
      if (!faculty || String(faculty.status || '').toUpperCase() !== 'ACTIVE') {
        return res.status(404).json({ error: 'This faculty is not currently active.' });
      }
      const access = await getFacultyMockAccessState(studentId, String(test.faculty_id), testId);
      if (access.freeCopyAvailable) {
        return res.status(409).json({ error: 'Your first copy of this mock is free. Submit it directly without making a payment.' });
      }
      if (access.paidCopiesRemaining > 0) {
        return res.status(409).json({ error: 'You already have a paid repeat copy for this mock. Submit your answer sheet directly.' });
      }
      if (!access.repeatPriceINR) {
        return res.status(503).json({ error: 'Faculty mock repeat-copy pricing has not been configured by the administrator yet.' });
      }
      orderResult = await createRazorpayOrder({
        studentId,
        purchaseType: 'FACULTY_MOCK',
        quantity: 1,
        facultyMockTestId: testId,
        facultyMockFacultyId: String(test.faculty_id),
        facultyMockPriceINR: access.repeatPriceINR,
      });
    } else if (purchaseType === 'COMBO_1' || purchaseType === 'COMBO_2') {
      if (req.user!.role !== 'STUDENT') {
        return res.status(403).json({
          error: 'Course-specific student combo plans are available to student accounts only.',
          code: 'STUDENT_PLAN_REQUIRED',
        });
      }

      const savedProfile = db.prepare(
        'SELECT ca_level FROM student_profiles WHERE user_id = ?'
      ).get(studentId) as { ca_level?: string } | undefined;
      const courseAccess = checkComboPurchaseCourseAccess(savedProfile?.ca_level, courseLevel);
      if (!courseAccess.allowed || !courseAccess.requestedCourseLevel) {
        const statusCode = courseAccess.code === 'INVALID_REQUESTED_COURSE' ? 400 : 403;
        return res.status(statusCode).json({
          error: courseAccess.message || 'This combo plan does not match your active CA course.',
          code: courseAccess.code,
          accountCourseLevel: courseAccess.accountCourseLevel,
          requestedCourseLevel: courseAccess.requestedCourseLevel,
        });
      }

      orderResult = await createRazorpayOrder({
        studentId,
        purchaseType,
        courseLevel: courseAccess.requestedCourseLevel as 'FOUNDATION' | 'INTERMEDIATE',
      });
    } else {
      // Custom evaluation purchase
      const rawQty = req.body.quantity;
      if (rawQty === undefined || rawQty === null || rawQty === '') {
        return res.status(400).json({ error: 'Please specify a valid quantity of evaluations.' });
      }

      const numQty = Number(rawQty);
      if (!Number.isInteger(numQty) || numQty < 1) {
        return res.status(400).json({ error: 'Evaluation quantity must be a positive whole integer (minimum 1).' });
      }
      if (numQty > 500) {
        return res.status(400).json({ error: 'Evaluation quantity exceeds safe application limit of 500 per order.' });
      }

      orderResult = await createRazorpayOrder({
        studentId,
        purchaseType: 'CUSTOM',
        quantity: numQty,
      });
    }

    return res.json({
      success: true,
      order: orderResult,
      isConfigured: isRazorpayConfigured(),
      keyId: getRazorpayKeyId(),
    });
  } catch (error: unknown) {
    console.error('Create payment order error:', error);
    const message = error instanceof Error ? error.message : 'Failed to create payment order';
    return res.status(400).json({ error: message });
  }
});

// Verify Payment and Fulfill Credits Idempotently
router.post('/verify', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const studentId = req.user!.id;
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return res.status(400).json({ error: 'Missing required payment verification parameters.' });
    }

    const result = await verifyAndFulfillPayment({
      studentId,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    });

    return res.json({
      success: true,
      creditsAdded: result.creditsAdded,
      message: result.creditsAdded > 0 ? 'Payment verified successfully and evaluation credits have been added.' : 'Payment verified successfully.',
    });
  } catch (error: unknown) {
    console.error('Verify payment error:', error);
    const message = error instanceof Error ? error.message : 'Payment verification failed';
    return res.status(400).json({ error: message });
  }
});

// Razorpay Webhook Receiver
router.post('/webhook', async (req: Request, res: Response) => {
  try {
    const signature = req.headers['x-razorpay-signature'] as string | undefined;
    const rawBody = (req as any).rawBody;

    if (!rawBody || (Buffer.isBuffer(rawBody) && rawBody.length === 0)) {
      return res.status(400).json({ error: 'Missing webhook raw request body' });
    }

    if (!signature) {
      return res.status(400).json({ error: 'Missing Razorpay webhook signature header' });
    }

    const result = await processRazorpayWebhook(rawBody, signature);

    if (result.status === 'ignored') {
      return res.status(200).json({
        received: true,
        status: 'ignored',
        event: result.event,
        reason: result.reason,
      });
    }

    return res.status(200).json({
      received: true,
      status: result.status,
      event: result.event,
      creditsAdded: result.creditsAdded ?? 0,
      alreadyProcessed: result.alreadyFulfilled ?? false,
    });
  } catch (error: unknown) {
    console.error('Webhook error:', error);
    const message = error instanceof Error ? error.message : 'Webhook processing failed';

    // Distinguish signature and secret errors (400) from server/database failures (500)
    if (
      message.toLowerCase().includes('signature') ||
      message.toLowerCase().includes('secret') ||
      message.toLowerCase().includes('missing') ||
      message.toLowerCase().includes('invalid json')
    ) {
      return res.status(400).json({ error: message });
    }

    return res.status(500).json({
      error: 'Webhook fulfillment failed',
      message,
    });
  }
});

export default router;
