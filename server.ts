import express from 'express';
import path from 'path';
import { EventEmitter } from 'node:events';
import { createServer as createViteServer } from 'vite';

// Increase default max listeners to accommodate Cloud Storage and Vite pipeline PassThrough streams
EventEmitter.defaultMaxListeners = 100;
import { db, initDatabase, closeDatabaseCleanly } from './server/db.js';
import authRoutes from './server/routes/authRoutes.js';
import studentRoutes from './server/routes/studentRoutes.js';
import instituteRoutes from './server/routes/instituteRoutes.js';
import adminRoutes from './server/routes/adminRoutes.js';
import paymentRoutes from './server/routes/paymentRoutes.js';
import publicRoutes, { getPublicReviewsHandler, votePublicReviewHandler } from './server/routes/publicRoutes.js';
import pricingRoutes from './server/routes/pricingRoutes.js';
import legalRoutes from './server/routes/legalRoutes.js';
import { authenticateToken } from './server/auth.js';
import { hydrateFromFirestore, seedBaselineToFirestoreIfEmpty } from './server/services/firestoreSyncService.js';

async function startServer() {
  // Initialize Database schemas, indices, and baseline ICAI materials
  initDatabase();

  // Hydrate persistent cloud data from Cloud Firestore BEFORE serving traffic
  try {
    console.log('[Server] Awaiting durable cloud state hydration from Cloud Firestore...');
    const hydrationPromise = Promise.all([
      hydrateFromFirestore(),
      seedBaselineToFirestoreIfEmpty(),
    ]);
    const hydrationTimeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Firestore hydration timeout limit (20s) reached')), 20000)
    );
    await Promise.race([hydrationPromise, hydrationTimeout]);
    console.log('[Server] Cloud Firestore state successfully restored to active runtime.');
  } catch (err) {
    console.warn('[Server] Firestore hydration note:', err);
  }

  const app = express();
  // Cloud Run and App Hosting automatically supply PORT (typically 8080).
  // In local development or AI Studio preview, falls back to 3000.
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  // Basic CORS & headers
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Razorpay-Signature');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // Body parsers with 50MB payload limit for PDF/image answer sheet uploads
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // API Routes
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'CA Exam Checker AI Production API',
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/health/email', async (req, res) => {
    try {
      const { verifySmtpTransporter, getSenderAddress } = await import('./server/services/emailService.js');
      const isConnected = await verifySmtpTransporter();
      const host = process.env.SMTP_HOST || 'smtp.resend.com';
      const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 465;
      const sender = getSenderAddress();

      res.json({
        status: isConnected ? 'ok' : 'degraded',
        smtp: {
          host,
          port,
          secure: port === 465,
          senderDomain: sender.includes('@') ? sender.split('@')[1].replace('>', '') : 'caexamcheckerai.com',
          sender,
          transporterVerified: isConnected,
          credentialsConfigured: Boolean(process.env.SMTP_PASS || process.env.RESEND_API_KEY),
        },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      res.status(500).json({
        status: 'error',
        message: err.message,
        timestamp: new Date().toISOString(),
      });
    }
  });

  app.get('/api/health/persistence', async (req, res) => {
    try {
      const { inspectCloudStorageStatus } = await import('./server/services/firebaseCloudStorageService.js');
      const gcsStatus = await inspectCloudStorageStatus();
      const evalCount = (db.prepare('SELECT count(*) as count FROM evaluations').get() as any)?.count || 0;
      const userCount = (db.prepare('SELECT count(*) as count FROM users').get() as any)?.count || 0;
      const matCount = (db.prepare('SELECT count(*) as count FROM evaluation_materials').get() as any)?.count || 0;

      res.json({
        status: 'ok',
        cloudStorage: gcsStatus,
        runtimeDatabase: {
          driver: 'SQLite (WAL mode)',
          evaluations: evalCount,
          users: userCount,
          materials: matCount,
          authoritativeStore: 'Cloud Firestore + Google Cloud Storage',
        },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/student', studentRoutes);
  app.use('/api/institute', instituteRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/payments', paymentRoutes);
  app.use('/api/public', publicRoutes);
  // Transparent Public Reviews API (supports both /api/reviews and /api/public/reviews)
  app.get('/api/reviews', getPublicReviewsHandler);
  app.post('/api/reviews/:id/vote', authenticateToken, votePublicReviewHandler);
  app.use('/api/pricing', pricingRoutes);
  app.use('/api/legal', legalRoutes);

  // Vite middleware in development vs static file serving in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`CA Exam Checker AI server successfully listening on http://0.0.0.0:${PORT} (PORT=${PORT}, NODE_ENV=${process.env.NODE_ENV || 'development'})`);
  });

  const handleShutdown = (signal: string) => {
    console.log(`[Server] Graceful shutdown initiated (${signal}).`);
    server.close(() => {
      console.log('[Server] HTTP connections closed. Closing database cleanly...');
      closeDatabaseCleanly();
      process.exit(0);
    });
    // Force exit if connections take too long to close
    setTimeout(() => {
      console.warn('[Server] Force shutdown after timeout.');
      closeDatabaseCleanly();
      process.exit(0);
    }, 5000).unref();
  };

  process.once('SIGTERM', () => handleShutdown('SIGTERM'));
  process.once('SIGINT', () => handleShutdown('SIGINT'));
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
