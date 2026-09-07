import { Router, Request, Response } from 'express';
import { authenticateToken, AuthRequest } from '../auth.js';
import {
  createRazorpayOrder,
  verifyAndFulfillPayment,
  processRazorpayWebhook,
  isRazorpayConfigured,
  getRazorpayKeyId,
} from '../razorpay.js';

const router = Router();

// Create Razorpay Order
router.post('/create-order', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const studentId = req.user!.id;
    const { quantity } = req.body;

    const creditQuantity = Number(quantity);
    if (!creditQuantity || creditQuantity < 1) {
      return res.status(400).json({ error: 'Please specify a valid quantity of credits (minimum 1).' });
    }

    const orderResult = await createRazorpayOrder({
      studentId,
      quantity: creditQuantity,
    });

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
router.post('/verify', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const studentId = req.user!.id;
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return res.status(400).json({ error: 'Missing required payment verification parameters.' });
    }

    const result = verifyAndFulfillPayment({
      studentId,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    });

    return res.json({
      success: true,
      creditsAdded: result.creditsAdded,
      message: 'Payment verified successfully and evaluation credits have been added.',
    });
  } catch (error: unknown) {
    console.error('Verify payment error:', error);
    const message = error instanceof Error ? error.message : 'Payment verification failed';
    return res.status(400).json({ error: message });
  }
});

// Razorpay Webhook Receiver
router.post('/webhook', (req: Request, res: Response) => {
  try {
    const signature = req.headers['x-razorpay-signature'] as string;
    const rawBody = JSON.stringify(req.body);

    processRazorpayWebhook(rawBody, signature);
    return res.status(200).json({ received: true });
  } catch (error: unknown) {
    console.error('Webhook error:', error);
    return res.status(400).json({ error: 'Webhook processing failed' });
  }
});

export default router;
