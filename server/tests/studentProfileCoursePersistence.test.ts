import assert from 'node:assert/strict';
import { db, initDatabase } from '../db.js';
import { authenticateToken, generateToken } from '../auth.js';
import studentRoutes from '../routes/studentRoutes.js';
import { persistStudentProfileEditToFirestore } from '../services/firestoreSyncService.js';

async function run() {
  initDatabase();

  const studentId = `usr_profile_course_${Date.now()}`;
  const otherStudentId = `${studentId}_other`;
  const email = `${studentId}@example.test`;
  const otherEmail = `${otherStudentId}@example.test`;
  const evaluationId = `eval_${studentId}`;

  db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, phone, role, status)
    VALUES (?, ?, 'test-hash', 'Course Test Student', '', 'STUDENT', 'ACTIVE')
  `).run(studentId, email);
  db.prepare(`
    INSERT INTO student_profiles (
      user_id, icai_registration_number, ca_level, city, preferred_subjects,
      free_evaluations_used, purchased_credits, paid_credits
    ) VALUES (?, 'CRO0123456', 'INTERMEDIATE', 'Test City', '["Taxation"]', 1, 7, 7)
  `).run(studentId);
  db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, phone, role, status)
    VALUES (?, ?, 'test-hash', 'Other Student', '', 'STUDENT', 'ACTIVE')
  `).run(otherStudentId, otherEmail);
  db.prepare(`
    INSERT INTO student_profiles (user_id, icai_registration_number, ca_level)
    VALUES (?, 'CRO0654321', 'INTERMEDIATE')
  `).run(otherStudentId);
  db.prepare(`
    INSERT INTO evaluations (
      id, student_id, level, material_type, subject_key, subject_name,
      original_filename, checking_mode, status
    ) VALUES (?, ?, 'INTERMEDIATE', 'PYQ', 'inter_tax', 'Taxation', 'history.pdf', 'standard', 'COMPLETED')
  `).run(evaluationId, studentId);

  try {
    const token = generateToken({ id: studentId, email, role: 'STUDENT', fullName: 'Course Test Student' });
    const studentRoutesInternals = studentRoutes as any;
    const getProfileHandler = studentRoutesInternals.stack
      .find((layer: any) => layer.route?.path === '/profile' && layer.route.methods.get)
      ?.route.stack[0].handle;
    const updateProfileHandler = studentRoutesInternals.stack
      .find((layer: any) => layer.route?.path === '/profile' && layer.route.methods.put)
      ?.route.stack[0].handle;
    assert.equal(typeof getProfileHandler, 'function', 'GET profile route must be registered');
    assert.equal(typeof updateProfileHandler, 'function', 'PUT profile route must be registered');

    const invoke = async (handler: Function, request: any) => {
      const response: any = {
        statusCode: 200,
        body: undefined,
        status(code: number) { this.statusCode = code; return this; },
        json(body: unknown) { this.body = body; return this; },
      };
      await handler(request, response);
      return response;
    };
    const authenticate = async (authToken: string | null) => {
      const request: any = {
        headers: authToken ? { authorization: `Bearer ${authToken}` } : {},
        query: {},
        cookies: {},
      };
      const response: any = {
        statusCode: 200,
        body: undefined,
        status(code: number) { this.statusCode = code; return this; },
        json(body: unknown) { this.body = body; return this; },
      };
      let continued = false;
      await authenticateToken(request, response, () => { continued = true; });
      return { request, response, continued };
    };
    const authenticatedRequest = async (authToken: string, body?: unknown) => {
      const auth = await authenticate(authToken);
      assert.equal(auth.continued, true, 'Valid student session must pass the actual auth middleware');
      auth.request.body = body || {};
      return auth.request;
    };

    const initialResponse = await invoke(getProfileHandler, await authenticatedRequest(token));
    assert.equal(initialResponse.statusCode, 200);
    assert.equal(initialResponse.body.profile.caLevel, 'INTERMEDIATE');
    const entitlementsBeforeSave = db.prepare(`
      SELECT free_evaluations_used, monthly_free_evaluations_used, purchased_credits, paid_credits,
             institute_id, batch_id, subscription_start_date, subscription_expiry_date
      FROM student_profiles WHERE user_id = ?
    `).get(studentId) as any;

    const saveResponse = await invoke(updateProfileHandler, await authenticatedRequest(token, {
        studentId: otherStudentId,
        fullName: 'Course Test Student',
        phone: '',
        city: 'Test City',
        caLevel: 'FINAL',
        preferredSubjects: ['Advanced Auditing'],
        avatarUrl: '',
      }));
    assert.equal(saveResponse.statusCode, 200);
    const saved = saveResponse.body;
    assert.equal(saved.profile.caLevel, 'FINAL', 'API must return the saved course');

    const reloadedResponse = await invoke(getProfileHandler, await authenticatedRequest(token));
    assert.equal(reloadedResponse.statusCode, 200);
    const reloaded = reloadedResponse.body;
    assert.equal(reloaded.profile.caLevel, 'FINAL', 'Fresh profile read must retain the saved course');

    const newLoginToken = generateToken({ id: studentId, email, role: 'STUDENT', fullName: 'Course Test Student' });
    const afterLoginResponse = await invoke(getProfileHandler, await authenticatedRequest(newLoginToken));
    const afterLogin = afterLoginResponse.body;
    assert.equal(afterLogin.profile.caLevel, 'FINAL', 'A fresh authenticated session must read the saved course');

    const unsupportedResponse = await invoke(updateProfileHandler, await authenticatedRequest(token, { caLevel: 'CA_FINAL' }));
    assert.equal(unsupportedResponse.statusCode, 400, 'Unsupported course values must be rejected');

    const unauthorized = await authenticate(null);
    assert.equal(unauthorized.continued, false);
    assert.equal(unauthorized.response.statusCode, 401, 'Unauthenticated profile updates must be rejected');

    const targetProfile = db.prepare(`
      SELECT ca_level, preferred_subjects, free_evaluations_used, monthly_free_evaluations_used,
             purchased_credits, paid_credits, institute_id, batch_id,
             subscription_start_date, subscription_expiry_date
      FROM student_profiles WHERE user_id = ?
    `).get(studentId) as any;
    assert.equal(targetProfile.ca_level, 'FINAL');
    for (const key of Object.keys(entitlementsBeforeSave)) {
      assert.equal(targetProfile[key], entitlementsBeforeSave[key], `Profile course update must not modify ${key}`);
    }
    assert.equal((db.prepare('SELECT ca_level FROM student_profiles WHERE user_id = ?').get(otherStudentId) as any)?.ca_level, 'INTERMEDIATE');
    assert.equal((db.prepare('SELECT level FROM evaluations WHERE id = ?').get(evaluationId) as any)?.level, 'INTERMEDIATE', 'Historical evaluation level must not change');

    // Model the stale cloud document that previously won on the next hydration.
    // An explicit profile save must write and verify the new value without the
    // generic older-local timestamp guard suppressing that user action.
    let cloudProfile: Record<string, any> = { ca_level: 'INTERMEDIATE', _updatedAt: '2999-01-01T00:00:00.000Z' };
    let writeCount = 0;
    const syncResult = await persistStudentProfileEditToFirestore(studentId, {
      ca_level: 'FINAL',
      preferred_subjects: '["Advanced Auditing"]',
      updated_at: '2026-10-15 12:00:00',
    }, {
      isConfigured: () => true,
      isTombstoned: async () => false,
      setDocument: async (_collection, _id, fields) => {
        writeCount += 1;
        cloudProfile = { ...cloudProfile, ...fields };
        return true;
      },
      getDocument: async <T,>() => cloudProfile as T,
    });
    assert.equal(syncResult, 'persisted');
    assert.equal(writeCount, 1, 'A deliberate profile edit must be written to cloud storage');
    assert.equal(cloudProfile.ca_level, 'FINAL', 'Stale cloud course must not override the explicit profile edit');

    const failedSyncResult = await persistStudentProfileEditToFirestore(studentId, { ca_level: 'INTERMEDIATE' }, {
      isConfigured: () => true,
      isTombstoned: async () => false,
      setDocument: async () => false,
      getDocument: async <T,>() => cloudProfile as T,
    });
    assert.equal(failedSyncResult, 'failed', 'A failed cloud write must not be reported as persisted');

    console.log('[PASS] Student course update persists, reloads, rejects unauthorized/invalid values, preserves history and entitlements, and overrides stale cloud course data.');
  } finally {
    db.prepare('DELETE FROM evaluations WHERE id = ?').run(evaluationId);
    db.prepare('DELETE FROM student_profiles WHERE user_id IN (?, ?)').run(studentId, otherStudentId);
    db.prepare('DELETE FROM users WHERE id IN (?, ?)').run(studentId, otherStudentId);
  }
}

run().catch((error) => {
  console.error('[FAIL] Student course update persistence regression:', error);
  process.exitCode = 1;
});
