import { Router, Response } from 'express';
import { db } from '../db.js';
import { authenticateToken, requireRole, AuthRequest } from '../auth.js';
import {
  DEFAULT_TERMS_OF_SERVICE,
  DEFAULT_PRIVACY_POLICY,
  DEFAULT_REFUND_POLICY,
  DEFAULT_LEGAL_SETTINGS,
} from '../services/legalConstants.js';
import { syncRecordToFirestore } from '../services/firestoreSyncService.js';

const router = Router();

export interface LegalDocumentRecord {
  id: string;
  doc_type: 'TERMS' | 'PRIVACY' | 'REFUND';
  title: string;
  version: string;
  effective_date: string;
  last_updated_date: string;
  content: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  changelog?: string;
  published_by?: string;
  created_at: string;
  updated_at: string;
  published_at?: string;
}

export function getLegalSettings(): Record<string, string> {
  const rows = db.prepare('SELECT key, value FROM legal_settings').all() as unknown as Array<{ key: string; value: string }>;
  const settings: Record<string, string> = { ...DEFAULT_LEGAL_SETTINGS };
  for (const row of rows) {
    if (row.value && row.value.trim() !== '') {
      settings[row.key] = row.value;
    }
  }
  return settings;
}

/**
 * Strips unverified bracketed placeholders from settings before sending to public clients
 */
export function getPublicLegalSettings(): Record<string, string> {
  const settings = getLegalSettings();
  const publicSettings: Record<string, string> = {
    support_email: settings.support_email || 'caexamchecker.support@gmail.com',
    instagram_url: settings.instagram_url || 'https://insta.openinapp.co/utw2r',
    governing_law: settings.governing_law || 'Laws of India',
  };
  if (settings.legal_entity_name && !settings.legal_entity_name.startsWith('[')) {
    publicSettings.legal_entity_name = settings.legal_entity_name;
  }
  if (settings.business_address && !settings.business_address.startsWith('[')) {
    publicSettings.business_address = settings.business_address;
  }
  if (settings.privacy_email && !settings.privacy_email.startsWith('[')) {
    publicSettings.privacy_email = settings.privacy_email;
  }
  return publicSettings;
}

/**
 * Format legal content for public display:
 * Replaces placeholders if real verified business details are configured.
 * If details are unverified or placeholders, strips out the placeholder lines completely so
 * public users never see bracketed placeholders or raw URLs.
 */
export function formatLegalContent(content: string, settings: Record<string, string>): string {
  let formatted = content;
  
  if (settings.legal_entity_name && !settings.legal_entity_name.startsWith('[') && !settings.legal_entity_name.endsWith(']')) {
    formatted = formatted.replaceAll('[LEGAL_ENTITY_NAME]', settings.legal_entity_name);
  }
  if (settings.business_address && !settings.business_address.startsWith('[') && !settings.business_address.endsWith(']')) {
    formatted = formatted.replaceAll('[VERIFIED_BUSINESS_ADDRESS]', settings.business_address);
  }
  if (settings.privacy_email && !settings.privacy_email.startsWith('[') && !settings.privacy_email.endsWith(']')) {
    formatted = formatted.replaceAll('[PRIVACY_OR_GRIEVANCE_EMAIL]', settings.privacy_email);
  }
  if (settings.dispute_jurisdiction && !settings.dispute_jurisdiction.startsWith('[') && !settings.dispute_jurisdiction.endsWith(']')) {
    formatted = formatted.replaceAll('[CONFIGURABLE_JURISDICTION]', settings.dispute_jurisdiction);
  }

  // Never expose raw URLs in the text
  formatted = formatted.replaceAll('https://insta.openinapp.co/utw2r', 'Official CA Exam Checker AI Instagram');

  // Strip unverified placeholder lines and tokens from public view
  formatted = formatted.replace(/(?:Legal Entity:\s*)?\[LEGAL_ENTITY_NAME\]\s*\n?/gi, '');
  formatted = formatted.replace(/(?:Business\/Registered Address:\s*)?\[VERIFIED_BUSINESS_ADDRESS\]\s*\n?/gi, '');
  formatted = formatted.replace(/(?:Privacy\/Grievance Contact:\s*)?\[PRIVACY_OR_GRIEVANCE_EMAIL\]\s*\n?/gi, '');
  formatted = formatted.replace(/(?:Jurisdiction details:\s*)?\[CONFIGURABLE_JURISDICTION\]\s*\n?/gi, '');
  formatted = formatted.replace(/Jurisdiction and dispute-resolution details must be configurable[^\n]*\n?/gi, '');
  formatted = formatted.replace(/Do not invent a jurisdiction\.\s*\n?/gi, '');
  
  // Clean redundant whitespace
  formatted = formatted.replace(/\n{3,}/g, '\n\n');

  return formatted.trim();
}

// --------------------------------------------------------------------------
// PUBLIC ENDPOINTS
// --------------------------------------------------------------------------

/**
 * GET /api/legal/published/:docType
 * Returns the currently active PUBLISHED legal document for TERMS, PRIVACY, or REFUND.
 */
router.get('/published/:docType', (req, res) => {
  const rawType = (req.params.docType || '').toUpperCase();
  let docType: 'TERMS' | 'PRIVACY' | 'REFUND' = 'TERMS';
  if (rawType.includes('PRIVACY')) docType = 'PRIVACY';
  else if (rawType.includes('REFUND') || rawType.includes('CANCELLATION')) docType = 'REFUND';
  else docType = 'TERMS';

  const doc = db.prepare(`
    SELECT * FROM legal_documents
    WHERE doc_type = ? AND status = 'PUBLISHED'
    ORDER BY published_at DESC, updated_at DESC
    LIMIT 1
  `).get(docType) as unknown as LegalDocumentRecord | undefined;

  const settings = getPublicLegalSettings();

  if (!doc) {
    // Return baseline fallback if not seeded
    let fallbackContent = DEFAULT_TERMS_OF_SERVICE;
    let fallbackTitle = 'CA EXAM CHECKER AI — TERMS OF SERVICE';
    if (docType === 'PRIVACY') {
      fallbackContent = DEFAULT_PRIVACY_POLICY;
      fallbackTitle = 'CA EXAM CHECKER AI — PRIVACY POLICY';
    } else if (docType === 'REFUND') {
      fallbackContent = DEFAULT_REFUND_POLICY;
      fallbackTitle = 'CA EXAM CHECKER AI — REFUND & CANCELLATION POLICY';
    }

    return res.json({
      success: true,
      document: {
        id: `${docType.toLowerCase()}_v1_0`,
        doc_type: docType,
        title: fallbackTitle,
        version: '1.0',
        effective_date: '12 September 2026',
        last_updated_date: '12 September 2026',
        content: formatLegalContent(fallbackContent, settings),
        raw_content: fallbackContent,
        status: 'PUBLISHED',
        published_at: '2026-09-12T00:00:00.000Z',
      },
      settings,
    });
  }

  res.json({
    success: true,
    document: {
      ...doc,
      content: formatLegalContent(doc.content, settings),
      raw_content: doc.content,
    },
    settings,
  });
});

/**
 * GET /api/legal/published-all
 * Returns all three active published legal documents and settings for rapid navigation.
 */
router.get('/published-all', (req, res) => {
  const settings = getPublicLegalSettings();
  const types: Array<'TERMS' | 'PRIVACY' | 'REFUND'> = ['TERMS', 'PRIVACY', 'REFUND'];
  const documents: Record<string, any> = {};

  for (const t of types) {
    const doc = db.prepare(`
      SELECT * FROM legal_documents
      WHERE doc_type = ? AND status = 'PUBLISHED'
      ORDER BY published_at DESC, updated_at DESC
      LIMIT 1
    `).get(t) as unknown as LegalDocumentRecord | undefined;

    if (doc) {
      documents[t] = {
        ...doc,
        content: formatLegalContent(doc.content, settings),
        raw_content: doc.content,
      };
    } else {
      let defaultContent = DEFAULT_TERMS_OF_SERVICE;
      let defaultTitle = 'CA EXAM CHECKER AI — TERMS OF SERVICE';
      if (t === 'PRIVACY') {
        defaultContent = DEFAULT_PRIVACY_POLICY;
        defaultTitle = 'CA EXAM CHECKER AI — PRIVACY POLICY';
      } else if (t === 'REFUND') {
        defaultContent = DEFAULT_REFUND_POLICY;
        defaultTitle = 'CA EXAM CHECKER AI — REFUND & CANCELLATION POLICY';
      }

      documents[t] = {
        id: `${t.toLowerCase()}_v1_0`,
        doc_type: t,
        title: defaultTitle,
        version: '1.0',
        effective_date: '12 September 2026',
        last_updated_date: '12 September 2026',
        content: formatLegalContent(defaultContent, settings),
        raw_content: defaultContent,
        status: 'PUBLISHED',
        published_at: '2026-09-12T00:00:00.000Z',
      };
    }
  }

  res.json({
    success: true,
    documents,
    settings,
  });
});

/**
 * GET /api/legal/settings
 * Public read of platform legal/support settings
 */
router.get('/settings', (req, res) => {
  res.json({
    success: true,
    settings: getLegalSettings(),
  });
});

/**
 * POST /api/legal/acknowledge
 * Records a user's acceptance of a legal document version (e.g. Terms v1.0).
 */
router.post('/acknowledge', authenticateToken, (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { docType, version } = req.body;
  if (!docType || !version) {
    return res.status(400).json({ error: 'docType and version are required' });
  }

  const id = `ack_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';
  const ua = req.headers['user-agent'] || 'unknown';

  db.prepare(`
    INSERT INTO legal_acknowledgements (id, user_id, doc_type, version, acknowledged_at, ip_address, user_agent)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?)
  `).run(id, userId, docType.toUpperCase(), version, ip, ua);

  // Sync to firestore if available
  syncRecordToFirestore('legal_acknowledgements', id, {
    id,
    user_id: userId,
    doc_type: docType.toUpperCase(),
    version,
    acknowledged_at: new Date().toISOString(),
    ip_address: ip,
  }).catch(() => {});

  res.json({ success: true, acknowledgedId: id });
});

// --------------------------------------------------------------------------
// SUPER ADMIN ENDPOINTS (Restricted to SUPER_ADMIN)
// --------------------------------------------------------------------------

/**
 * GET /api/legal/admin/versions
 * Returns all document versions (DRAFT, PUBLISHED, ARCHIVED) for management.
 */
router.get('/admin/versions', authenticateToken, requireRole('SUPER_ADMIN'), (req: AuthRequest, res: Response) => {
  const versions = db.prepare(`
    SELECT * FROM legal_documents
    ORDER BY created_at DESC
  `).all() as unknown as LegalDocumentRecord[];

  const settings = getLegalSettings();

  res.json({
    success: true,
    versions,
    settings,
  });
});

/**
 * GET /api/legal/admin/versions/:id
 * Returns a specific document version.
 */
router.get('/admin/versions/:id', authenticateToken, requireRole('SUPER_ADMIN'), (req: AuthRequest, res: Response) => {
  const doc = db.prepare('SELECT * FROM legal_documents WHERE id = ?').get(req.params.id) as unknown as LegalDocumentRecord | undefined;
  if (!doc) {
    return res.status(404).json({ error: 'Legal document version not found' });
  }

  res.json({
    success: true,
    document: doc,
  });
});

/**
 * POST /api/legal/admin/draft
 * Creates a new DRAFT legal document.
 */
router.post('/admin/draft', authenticateToken, requireRole('SUPER_ADMIN'), async (req: AuthRequest, res: Response) => {
  const { doc_type, title, version, effective_date, last_updated_date, content, changelog } = req.body;

  if (!doc_type || !title || !version || !content) {
    return res.status(400).json({ error: 'Missing required fields: doc_type, title, version, content' });
  }

  const validTypes = ['TERMS', 'PRIVACY', 'REFUND'];
  if (!validTypes.includes(doc_type)) {
    return res.status(400).json({ error: 'Invalid doc_type. Must be TERMS, PRIVACY, or REFUND' });
  }

  const id = `legaldoc_${doc_type.toLowerCase()}_${Date.now()}`;
  const effective = effective_date || new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const lastUpdated = last_updated_date || effective;

  db.prepare(`
    INSERT INTO legal_documents (
      id, doc_type, title, version, effective_date, last_updated_date,
      content, status, changelog, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(id, doc_type, title, version, effective, lastUpdated, content, changelog || '');

  // Log audit
  const auditId = `audit_${Date.now()}`;
  db.prepare(`
    INSERT INTO audit_logs (id, user_id, user_email, action, entity_type, entity_id, details)
    VALUES (?, ?, ?, 'CREATE_LEGAL_DRAFT', 'legal_documents', ?, ?)
  `).run(auditId, req.user?.id, req.user?.email, id, `Created DRAFT version ${version} of ${doc_type}`);

  const createdDoc = db.prepare('SELECT * FROM legal_documents WHERE id = ?').get(id) as unknown as LegalDocumentRecord;

  // Persist to Cloud Firestore
  await syncRecordToFirestore('legal_documents', id, createdDoc).catch(() => {});

  res.json({
    success: true,
    message: 'Draft created successfully',
    document: createdDoc,
  });
});

/**
 * PUT /api/legal/admin/draft/:id
 * Updates an existing DRAFT document. Published or Archived documents cannot be directly edited.
 */
router.put('/admin/draft/:id', authenticateToken, requireRole('SUPER_ADMIN'), async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM legal_documents WHERE id = ?').get(id) as unknown as LegalDocumentRecord | undefined;

  if (!existing) {
    return res.status(404).json({ error: 'Legal document not found' });
  }

  if (existing.status !== 'DRAFT') {
    return res.status(400).json({
      error: `Cannot modify a document with status '${existing.status}'. Please create a new draft to modify terms.`,
    });
  }

  const { title, version, effective_date, last_updated_date, content, changelog } = req.body;

  db.prepare(`
    UPDATE legal_documents
    SET title = COALESCE(?, title),
        version = COALESCE(?, version),
        effective_date = COALESCE(?, effective_date),
        last_updated_date = COALESCE(?, last_updated_date),
        content = COALESCE(?, content),
        changelog = COALESCE(?, changelog),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(title, version, effective_date, last_updated_date, content, changelog, id);

  const updatedDoc = db.prepare('SELECT * FROM legal_documents WHERE id = ?').get(id) as unknown as LegalDocumentRecord;

  // Persist to Cloud Firestore
  await syncRecordToFirestore('legal_documents', id, updatedDoc).catch(() => {});

  res.json({
    success: true,
    message: 'Draft updated successfully',
    document: updatedDoc,
  });
});

/**
 * POST /api/legal/admin/publish/:id
 * Publishes a DRAFT document.
 * Automatically archives the currently active published document for that doc_type.
 * Preserves full version history for audit and legal compliance.
 */
router.post('/admin/publish/:id', authenticateToken, requireRole('SUPER_ADMIN'), async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const docToPublish = db.prepare('SELECT * FROM legal_documents WHERE id = ?').get(id) as unknown as LegalDocumentRecord | undefined;

  if (!docToPublish) {
    return res.status(404).json({ error: 'Legal document not found' });
  }

  const adminEmail = req.user?.email || 'admin@caexamchecker.ai';
  const nowIso = new Date().toISOString();

  // 1. Archive previous published version of the same doc_type
  const previousPublished = db.prepare(`
    SELECT id FROM legal_documents
    WHERE doc_type = ? AND status = 'PUBLISHED' AND id != ?
  `).all(docToPublish.doc_type, id) as unknown as Array<{ id: string }>;

  for (const prev of previousPublished) {
    db.prepare(`
      UPDATE legal_documents
      SET status = 'ARCHIVED', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(prev.id);

    syncRecordToFirestore('legal_documents', prev.id, {
      status: 'ARCHIVED',
      updated_at: nowIso,
    }).catch(() => {});
  }

  // 2. Set this document as PUBLISHED
  db.prepare(`
    UPDATE legal_documents
    SET status = 'PUBLISHED',
        published_by = ?,
        published_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(adminEmail, id);

  const publishedDoc = db.prepare('SELECT * FROM legal_documents WHERE id = ?').get(id) as unknown as LegalDocumentRecord;

  // Sync to Firestore
  await syncRecordToFirestore('legal_documents', id, publishedDoc).catch(() => {});

  // 3. Log immutable audit entry
  const auditId = `audit_${Date.now()}`;
  db.prepare(`
    INSERT INTO audit_logs (id, user_id, user_email, action, entity_type, entity_id, details)
    VALUES (?, ?, ?, 'PUBLISH_LEGAL_DOCUMENT', 'legal_documents', ?, ?)
  `).run(
    auditId,
    req.user?.id,
    adminEmail,
    id,
    `Published ${publishedDoc.doc_type} version ${publishedDoc.version}. Archived ${previousPublished.length} previous version(s).`
  );

  res.json({
    success: true,
    message: `Successfully published ${publishedDoc.doc_type} version ${publishedDoc.version}`,
    document: publishedDoc,
  });
});

/**
 * POST /api/legal/admin/archive/:id
 * Archives a document version.
 */
router.post('/admin/archive/:id', authenticateToken, requireRole('SUPER_ADMIN'), async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  db.prepare(`
    UPDATE legal_documents
    SET status = 'ARCHIVED', updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(id);

  const updatedDoc = db.prepare('SELECT * FROM legal_documents WHERE id = ?').get(id) as unknown as LegalDocumentRecord;
  if (updatedDoc) {
    await syncRecordToFirestore('legal_documents', id, updatedDoc).catch(() => {});
  }

  res.json({
    success: true,
    message: 'Document version archived',
    document: updatedDoc,
  });
});

/**
 * PUT /api/legal/admin/settings
 * Update company business details and legal settings.
 * If details are not yet verified, they can be left with clear placeholders.
 */
router.put('/admin/settings', authenticateToken, requireRole('SUPER_ADMIN'), async (req: AuthRequest, res: Response) => {
  const {
    legal_entity_name,
    business_address,
    privacy_email,
    support_email,
    instagram_url,
    governing_law,
    dispute_jurisdiction,
  } = req.body;

  const updates: Record<string, string> = {
    legal_entity_name: legal_entity_name?.trim() || '',
    business_address: business_address?.trim() || '',
    privacy_email: privacy_email?.trim() || 'caexamchecker.support@gmail.com',
    support_email: support_email?.trim() || 'caexamchecker.support@gmail.com',
    instagram_url: instagram_url?.trim() || 'https://insta.openinapp.co/utw2r',
    governing_law: governing_law?.trim() || 'Laws of India',
    dispute_jurisdiction: dispute_jurisdiction?.trim() || 'Courts of India',
  };

  for (const [key, value] of Object.entries(updates)) {
    db.prepare(`
      INSERT INTO legal_settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `).run(key, value);

    syncRecordToFirestore('legal_settings', key, { key, value, updated_at: new Date().toISOString() }).catch(() => {});
  }

  // Audit log
  const auditId = `audit_${Date.now()}`;
  db.prepare(`
    INSERT INTO audit_logs (id, user_id, user_email, action, entity_type, entity_id, details)
    VALUES (?, ?, ?, 'UPDATE_LEGAL_SETTINGS', 'legal_settings', 'all', ?)
  `).run(auditId, req.user?.id, req.user?.email, 'Updated legal entity and contact settings');

  res.json({
    success: true,
    message: 'Legal and business settings updated successfully',
    settings: getLegalSettings(),
  });
});

export default router;
