import fs from 'fs';
import path from 'path';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  Firestore,
} from 'firebase/firestore';
import { Request, Response, NextFunction } from 'express';
import { db } from '../db.js';

let firestoreInstance: Firestore | null = null;
let firestoreInitAttempted = false;

/**
 * Lazily initialize and return the Firestore database instance
 * using credentials from firebase-applet-config.json.
 */
export function getFirestoreDb(): Firestore | null {
  if (firestoreInstance) return firestoreInstance;
  if (firestoreInitAttempted && !firestoreInstance) return null;

  firestoreInitAttempted = true;
  try {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(raw);
      const app = getApps().length === 0 ? initializeApp(config) : getApp();
      firestoreInstance = config.firestoreDatabaseId
        ? getFirestore(app, config.firestoreDatabaseId)
        : getFirestore(app);
      console.log('[Firestore] Successfully initialized with databaseId:', config.firestoreDatabaseId || '(default)');
      return firestoreInstance;
    }
  } catch (err) {
    console.warn('[Firestore] Could not initialize Firestore client:', err);
  }
  return null;
}

export interface EnrollmentValidationResult {
  isValid: boolean;
  source: 'FIRESTORE' | 'LOCAL_SQLITE' | 'FALLBACK';
  status?: string;
  reason?: string;
  enrollmentData?: any;
}

/**
 * Validates a student's active enrollment in a specific institute
 * by checking the 'enrollments' collection in Firestore.
 * Ensures evaluations can ONLY be sponsored by institutes where
 * the student has an 'ACTIVE' status.
 */
export async function validateStudentInstituteEnrollment(
  studentId: string,
  instituteId: string
): Promise<EnrollmentValidationResult> {
  if (!studentId || !instituteId) {
    return {
      isValid: false,
      source: 'FALLBACK',
      reason: 'Missing student ID or institute ID for enrollment validation.',
    };
  }

  const firestore = getFirestoreDb();

  // 1. Check Firestore 'enrollments' collection
  if (firestore) {
    try {
      const enrollmentsRef = collection(firestore, 'enrollments');

      // Check with studentId and instituteId (support both camelCase and snake_case field schemas)
      const variations = [
        query(enrollmentsRef, where('studentId', '==', studentId), where('instituteId', '==', instituteId)),
        query(enrollmentsRef, where('student_id', '==', studentId), where('institute_id', '==', instituteId)),
        query(enrollmentsRef, where('userId', '==', studentId), where('instituteId', '==', instituteId)),
      ];

      for (const q of variations) {
        try {
          const snapshot = await getDocs(q);
          if (!snapshot.empty) {
            for (const docSnap of snapshot.docs) {
              const data = docSnap.data();
              const rawStatus = (data.status || data.enrollmentStatus || '').toString().toUpperCase();

              if (rawStatus === 'ACTIVE') {
                return {
                  isValid: true,
                  source: 'FIRESTORE',
                  status: 'ACTIVE',
                  enrollmentData: { id: docSnap.id, ...data },
                };
              } else {
                // An explicit non-active record found in Firestore (e.g., INACTIVE, SUSPENDED, EXPIRED, PENDING)
                return {
                  isValid: false,
                  source: 'FIRESTORE',
                  status: rawStatus,
                  reason: `Enrollment in this coaching institute is not active (status: ${rawStatus || 'UNKNOWN'}).`,
                  enrollmentData: { id: docSnap.id, ...data },
                };
              }
            }
          }
        } catch {
          // Individual query index/field mismatch fallback, try next variation
        }
      }
    } catch (firestoreErr) {
      console.warn('[Firestore] Error querying enrollments collection:', firestoreErr);
    }
  }

  // 2. Local database validation (institute_memberships) as complementary verification / fallback
  try {
    const localMembership = db.prepare(`
      SELECT m.id, m.status, m.removed_at, m.sponsored_access,
             i.status as institute_status, i.name as institute_name
      FROM institute_memberships m
      JOIN institutes i ON i.id = m.institute_id
      WHERE m.student_id = ?
        AND m.institute_id = ?
    `).get(studentId, instituteId) as {
      id: string;
      status: string;
      removed_at?: string;
      sponsored_access?: number;
      institute_status: string;
      institute_name: string;
    } | undefined;

    if (localMembership) {
      const isMemActive = localMembership.status === 'ACTIVE' &&
        (!localMembership.removed_at || localMembership.removed_at === '') &&
        (localMembership.sponsored_access === 1 || localMembership.sponsored_access === null || localMembership.sponsored_access === undefined) &&
        localMembership.institute_status === 'ACTIVE';

      if (isMemActive) {
        return {
          isValid: true,
          source: 'LOCAL_SQLITE',
          status: 'ACTIVE',
          enrollmentData: localMembership,
        };
      } else {
        return {
          isValid: false,
          source: 'LOCAL_SQLITE',
          status: localMembership.status,
          reason: 'Your enrollment in this coaching institute is inactive or has been suspended.',
        };
      }
    }
  } catch (localErr) {
    console.warn('[Validation] Local membership lookup error:', localErr);
  }

  return {
    isValid: false,
    source: 'FALLBACK',
    reason: 'Access denied: You do not have an active enrollment in this coaching institute.',
  };
}

/**
 * Express middleware to validate active institute enrollment.
 * Used on routes that require or request coaching institute sponsorship.
 */
export async function requireActiveInstituteEnrollmentMiddleware(
  req: Request & { user?: any },
  res: Response,
  next: NextFunction
) {
  try {
    const studentId = req.user?.id || req.body.studentId || req.body.student_id;
    let targetInstituteId =
      req.body.instituteId ||
      req.body.sponsoringInstituteId ||
      req.body.sponsoring_institute_id ||
      req.params.instituteId ||
      req.query.instituteId;

    const evaluationSource = req.body.evaluationSource || req.query.evaluationSource;

    // Check if submitting to an institute test or material by URL param
    if (!targetInstituteId && req.params.id) {
      try {
        const testRow = db.prepare('SELECT institute_id FROM institute_tests WHERE id = ?').get(req.params.id) as any;
        if (testRow?.institute_id) {
          targetInstituteId = testRow.institute_id;
        } else {
          const matRow = db.prepare('SELECT institute_id FROM institute_materials WHERE id = ?').get(req.params.id) as any;
          if (matRow?.institute_id) {
            targetInstituteId = matRow.institute_id;
          }
        }
      } catch {}
    }

    // If targetInstituteId is not explicitly provided but evaluationSource is INSTITUTE,
    // resolve from student's active institute membership if single, or ask to specify.
    if (!targetInstituteId && evaluationSource === 'INSTITUTE' && studentId) {
      try {
        const studentInstitutes = db.prepare(`
          SELECT institute_id FROM institute_memberships
          WHERE student_id = ? AND status = 'ACTIVE'
        `).all(studentId) as Array<{ institute_id: string }>;

        if (studentInstitutes.length === 0) {
          return res.status(403).json({
            error: 'Access denied: You do not have an active enrollment in any coaching institute.',
          });
        } else if (studentInstitutes.length === 1) {
          targetInstituteId = studentInstitutes[0].institute_id;
          req.body.instituteId = targetInstituteId;
        } else {
          return res.status(400).json({
            error: 'Please select a coaching institute for Institute Evaluation.',
          });
        }
      } catch {}
    }

    // If an institute is explicitly specified or evaluationSource is INSTITUTE, validation is mandatory
    if (targetInstituteId || evaluationSource === 'INSTITUTE') {
      if (!studentId) {
        return res.status(401).json({ error: 'Authentication required for institute evaluation.' });
      }
      if (!targetInstituteId) {
        return res.status(400).json({ error: 'Institute ID is required for institute evaluation.' });
      }

      const check = await validateStudentInstituteEnrollment(studentId, String(targetInstituteId));
      if (!check.isValid) {
        return res.status(403).json({
          error: check.reason || 'Access denied: You do not have an active enrollment in this coaching institute.',
        });
      }
    }

    next();
  } catch (err: any) {
    console.error('[Middleware] requireActiveInstituteEnrollmentMiddleware error:', err);
    return res.status(500).json({ error: 'Failed to validate institute enrollment' });
  }
}
