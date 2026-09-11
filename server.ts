import express from 'express';
import path from 'path';
import { EventEmitter } from 'node:events';
import { createServer as createViteServer } from 'vite';

// Increase default max listeners to accommodate Cloud Storage and Vite pipeline PassThrough streams
EventEmitter.defaultMaxListeners = 100;
import { initDatabase } from './server/db.js';
import authRoutes from './server/routes/authRoutes.js';
import studentRoutes from './server/routes/studentRoutes.js';
import instituteRoutes from './server/routes/instituteRoutes.js';
import adminRoutes from './server/routes/adminRoutes.js';
import paymentRoutes from './server/routes/paymentRoutes.js';
import publicRoutes from './server/routes/publicRoutes.js';
import pricingRoutes from './server/routes/pricingRoutes.js';
import { hydrateFromFirestore, seedBaselineToFirestoreIfEmpty } from './server/services/firestoreSyncService.js';

async function startServer() {
  // Initialize Database schemas, indices, and baseline ICAI materials
  initDatabase();

  // Hydrate persistent cloud data from Cloud Firestore (runs asynchronously)
  hydrateFromFirestore()
    .then(() => seedBaselineToFirestoreIfEmpty())
    .catch((err) => console.warn('[Server] Firestore hydration note:', err));

  const app = express();
  const PORT = 3000;

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

  app.use('/api/auth', authRoutes);
  app.use('/api/student', studentRoutes);
  app.use('/api/institute', instituteRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/payments', paymentRoutes);
  app.use('/api/public', publicRoutes);
  app.use('/api/pricing', pricingRoutes);

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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CA Exam Checker AI server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
