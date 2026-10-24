import fs from 'node:fs';
import path from 'node:path';

// Firebase Admin SDK (Server-Side Privileged SDK with Application Default Credentials)
import { initializeApp as initAdminApp, getApps as getAdminApps, getApp as getAdminApp, App as AdminApp } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore, Firestore as AdminFirestore } from 'firebase-admin/firestore';

// Firebase Client SDK (Fallback for local development / test environments without GCP ADC)
import { initializeApp as initClientApp, getApps as getClientApps, getApp as getClientApp, FirebaseApp as ClientApp } from 'firebase/app';
import {
  getFirestore as getClientFirestore,
  doc as clientDoc,
  getDoc as clientGetDoc,
  setDoc as clientSetDoc,
  deleteDoc as clientDeleteDoc,
  writeBatch as clientWriteBatch,
  collection as clientCollection,
  getDocs as clientGetDocs,
  query as clientQuery,
  where as clientWhere,
  runTransaction as runClientTransaction,
  terminate as terminateClientFirestore,
  Firestore as ClientFirestore,
  DocumentData,
  setLogLevel as setClientLogLevel,
} from 'firebase/firestore';

import { loadAndValidateFirebaseConfig } from '../config/firebaseConfigValidator.js';

// Suppress benign internal gRPC stream cancel warnings from client SDK
try {
  setClientLogLevel('error');
} catch {}

export type FirestoreDriverMode = 'ADMIN_SDK' | 'CLIENT_SDK' | 'OFFLINE';

let activeDriverMode: FirestoreDriverMode = 'OFFLINE';
let adminDbInstance: AdminFirestore | null = null;
let clientDbInstance: ClientFirestore | null = null;
let initAttempted = false;

export interface TransactionDocSnapshot {
  exists: boolean;
  id: string;
  data: () => Record<string, any> | undefined;
}

export interface FirestoreTransactionHandler {
  get: (collectionName: string, docId: string) => Promise<TransactionDocSnapshot>;
  set: (collectionName: string, docId: string, data: Record<string, any>) => void;
  delete: (collectionName: string, docId: string) => void;
}

export function getFirestoreDriverMode(): FirestoreDriverMode {
  return activeDriverMode;
}

function switchToClientSdkFallback(reason?: string) {
  if (activeDriverMode !== 'CLIENT_SDK') {
    console.warn(`[Firestore] Switching driver to Client SDK${reason ? ` (${reason})` : ''}.`);
    activeDriverMode = 'CLIENT_SDK';
  }
}

/**
 * Authoritative Firestore Database Initializer
 *
 * Primary: Firebase Admin SDK with Google Cloud Application Default Credentials (ADC).
 *   - Used in Google Cloud Run / Firebase App Hosting production runtimes (caexamcheckerai-prod).
 *   - Bypasses client-side security rules, authenticates via runtime Service Account IAM (roles/datastore.user).
 *   - Targets the configured projectId and named firestoreDatabaseId.
 * Fallback: Firebase Web Client SDK with API Key.
 *   - Seamlessly activates in local development or sandboxes where GCP metadata server / ADC is absent.
 */
export function getFirestoreDb(): any {
  if (activeDriverMode === 'ADMIN_SDK' && adminDbInstance) return adminDbInstance;
  if (activeDriverMode === 'CLIENT_SDK' && clientDbInstance) return clientDbInstance;
  if (initAttempted && activeDriverMode === 'OFFLINE') return null;

  initAttempted = true;
  const { config } = loadAndValidateFirebaseConfig();
  const dbId = config.firestoreDatabaseId && config.firestoreDatabaseId !== '(default)'
    ? config.firestoreDatabaseId
    : '(default)';

  // 1. Prepare Client SDK fallback so it is immediately available if Admin SDK is unavailable or downgraded
  try {
    const clientApps = getClientApps();
    const clientApp: ClientApp = clientApps.length === 0 ? initClientApp(config) : getClientApp();
    clientDbInstance = dbId !== '(default)'
      ? getClientFirestore(clientApp, dbId)
      : getClientFirestore(clientApp);
  } catch (clientErr: any) {
    console.warn('[Firestore] Client SDK initialization notice:', clientErr?.message || clientErr);
  }

  // 2. Determine whether production Cloud Run runtime identity with ADC should be used
  const isProductionAppHosting = Boolean(
    process.env.FIREBASE_APP_HOSTING ||
    process.env.USE_FIREBASE_ADMIN === 'true' ||
    (process.env.K_SERVICE && !process.env.K_SERVICE.startsWith('ais-dev'))
  );

  if (isProductionAppHosting && activeDriverMode !== 'CLIENT_SDK') {
    try {
      const adminApps = getAdminApps();
      const adminApp: AdminApp = adminApps.length === 0
        ? initAdminApp({ projectId: config.projectId })
        : getAdminApp();

      adminDbInstance = dbId !== '(default)'
        ? getAdminFirestore(adminApp, dbId)
        : getAdminFirestore(adminApp);
      activeDriverMode = 'ADMIN_SDK';
      console.log(`[Firestore] Initialized Firebase Admin SDK (Cloud Run / ADC) for database: ${dbId} on project: ${config.projectId}`);
      return adminDbInstance;
    } catch (adminErr: any) {
      console.warn(`[Firestore] Firebase Admin SDK initialization note (${adminErr?.message || adminErr}). Falling back to Client SDK...`);
    }
  }

  if (clientDbInstance) {
    activeDriverMode = 'CLIENT_SDK';
    console.log(`[Firestore] Initialized Firebase Client SDK driver for database: ${dbId}`);
    return clientDbInstance;
  }

  activeDriverMode = 'OFFLINE';
  throw new Error('[Firestore FATAL] Initialization error across all SDK drivers.');
}

export async function closeFirestoreCleanly(): Promise<void> {
  if (adminDbInstance) {
    try {
      await adminDbInstance.terminate();
      console.log('[Firestore] Cleanly terminated Firebase Admin SDK database connection.');
    } catch {}
    adminDbInstance = null;
  }
  if (clientDbInstance) {
    try {
      await terminateClientFirestore(clientDbInstance);
      console.log('[Firestore] Cleanly terminated Firebase Client SDK database connection.');
    } catch {}
    clientDbInstance = null;
  }
  activeDriverMode = 'OFFLINE';
  initAttempted = false;
}

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number = 12000,
  fallback: T,
  operationName: string = 'Firestore operation'
): Promise<T> {
  let timeoutHandle: any;
  const timeoutPromise = new Promise<T>((resolve) => {
    timeoutHandle = setTimeout(() => {
      console.warn(`[Firestore TIMEOUT] ${operationName} exceeded ${ms}ms threshold; applying fallback.`);
      resolve(fallback);
    }, ms);
  });

  promise.catch(() => {});

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutHandle);
    return result;
  } catch (err) {
    clearTimeout(timeoutHandle);
    throw err;
  }
}

export async function setFirestoreDoc(
  collectionName: string,
  docId: string,
  data: Record<string, any>
): Promise<boolean> {
  getFirestoreDb();
  if (!docId) return false;

  const cleanData: Record<string, any> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) cleanData[k] = v;
  }
  cleanData._updatedAt = new Date().toISOString();

  if (activeDriverMode === 'ADMIN_SDK' && adminDbInstance) {
    try {
      const docRef = adminDbInstance.collection(collectionName).doc(String(docId));
      await withTimeout(
        docRef.set(cleanData, { merge: true }).then(() => true),
        12000,
        false,
        `setFirestoreDoc[Admin](${collectionName}/${docId})`
      );
      return true;
    } catch (err: any) {
      // If Admin SDK experienced ADC permission denial in local dev, switch driver to Client SDK
      if (err?.code === 7 || err?.message?.includes('PERMISSION_DENIED')) {
        console.warn(`[Firestore] Admin SDK permission denied for ${collectionName}/${docId}; falling back to Client SDK.`);
        activeDriverMode = 'CLIENT_SDK';
        return setFirestoreDoc(collectionName, docId, data);
      }
      console.warn(`[Firestore] Failed to set document in ${collectionName}/${docId}:`, err?.message || err);
      return false;
    }
  }

  if (clientDbInstance) {
    try {
      return await withTimeout(
        clientSetDoc(clientDoc(clientDbInstance, collectionName, String(docId)), cleanData, { merge: true }).then(() => true),
        12000,
        false,
        `setFirestoreDoc[Client](${collectionName}/${docId})`
      );
    } catch (err) {
      console.warn(`[Firestore] Failed to set document in ${collectionName}/${docId}:`, err);
      return false;
    }
  }

  return false;
}

export async function setFirestoreDocsAtomically(
  writes: Array<{ collectionName: string; docId: string; data: Record<string, any> }>
): Promise<boolean> {
  getFirestoreDb();
  if (writes.length === 0 || writes.some((w) => !w.docId)) return false;

  const nowIso = new Date().toISOString();

  if (activeDriverMode === 'ADMIN_SDK' && adminDbInstance) {
    try {
      const batch = adminDbInstance.batch();
      for (const w of writes) {
        const cleanData: Record<string, any> = {};
        for (const [key, value] of Object.entries(w.data)) {
          if (value !== undefined) cleanData[key] = value;
        }
        cleanData._updatedAt = nowIso;
        batch.set(adminDbInstance.collection(w.collectionName).doc(String(w.docId)), cleanData, { merge: true });
      }
      return await withTimeout(
        batch.commit().then(() => true),
        12000,
        false,
        'setFirestoreDocsAtomically[Admin]'
      );
    } catch (err: any) {
      if (err?.code === 7 || err?.message?.includes('PERMISSION_DENIED')) {
        activeDriverMode = 'CLIENT_SDK';
        return setFirestoreDocsAtomically(writes);
      }
      console.warn('[Firestore] Failed to atomically persist records:', err);
      return false;
    }
  }

  if (clientDbInstance) {
    try {
      const batch = clientWriteBatch(clientDbInstance);
      for (const w of writes) {
        const cleanData: Record<string, any> = {};
        for (const [key, value] of Object.entries(w.data)) {
          if (value !== undefined) cleanData[key] = value;
        }
        cleanData._updatedAt = nowIso;
        batch.set(clientDoc(clientDbInstance, w.collectionName, String(w.docId)), cleanData, { merge: true });
      }
      return await withTimeout(
        batch.commit().then(() => true),
        12000,
        false,
        'setFirestoreDocsAtomically[Client]'
      );
    } catch (err) {
      console.warn('[Firestore] Failed to atomically persist records:', err);
      return false;
    }
  }

  return false;
}

export async function getFirestoreDoc<T = any>(
  collectionName: string,
  docId: string,
  options: { failOnError?: boolean } = {}
): Promise<T | null> {
  getFirestoreDb();
  if (!docId) {
    const error = new Error(`Missing document ID while reading ${collectionName}.`);
    if (options.failOnError) throw error;
    return null;
  }

  if (activeDriverMode === 'ADMIN_SDK' && adminDbInstance) {
    try {
      const snap = await withTimeout(
        adminDbInstance.collection(collectionName).doc(String(docId)).get(),
        12000,
        null as any,
        `getFirestoreDoc[Admin](${collectionName}/${docId})`
      );
      if (!snap) {
        if (options.failOnError) throw new Error(`Firestore read timed out for ${collectionName}/${docId}.`);
        return null;
      }
      if (!snap.exists) return null;
      return { id: snap.id, ...snap.data() } as unknown as T;
    } catch (err: any) {
      if (err?.code === 7 || err?.message?.includes('PERMISSION_DENIED')) {
        activeDriverMode = 'CLIENT_SDK';
        return getFirestoreDoc<T>(collectionName, docId, options);
      }
      console.warn(`[Firestore] Failed to get document in ${collectionName}/${docId}:`, err?.message || err);
      if (options.failOnError) throw err;
      return null;
    }
  }

  if (clientDbInstance) {
    try {
      const snap = await withTimeout(
        clientGetDoc(clientDoc(clientDbInstance, collectionName, String(docId))),
        12000,
        null as any,
        `getFirestoreDoc[Client](${collectionName}/${docId})`
      );
      if (!snap) {
        if (options.failOnError) throw new Error(`Firestore read timed out for ${collectionName}/${docId}.`);
        return null;
      }
      if (!snap.exists()) return null;
      return { id: snap.id, ...snap.data() } as unknown as T;
    } catch (err) {
      console.warn(`[Firestore] Failed to get document in ${collectionName}/${docId}:`, err);
      if (options.failOnError) throw err;
      return null;
    }
  }

  if (options.failOnError) throw new Error(`Firestore is unavailable while reading ${collectionName}/${docId}.`);
  return null;
}

export async function deleteFirestoreDoc(collectionName: string, docId: string): Promise<boolean> {
  getFirestoreDb();
  if (!docId) return false;

  if (activeDriverMode === 'ADMIN_SDK' && adminDbInstance) {
    try {
      return await withTimeout(
        adminDbInstance.collection(collectionName).doc(String(docId)).delete().then(() => true),
        12000,
        false,
        `deleteFirestoreDoc[Admin](${collectionName}/${docId})`
      );
    } catch (err: any) {
      if (err?.code === 7 || err?.message?.includes('PERMISSION_DENIED')) {
        activeDriverMode = 'CLIENT_SDK';
        return deleteFirestoreDoc(collectionName, docId);
      }
      console.warn(`[Firestore] Failed to delete document in ${collectionName}/${docId}:`, err);
      return false;
    }
  }

  if (clientDbInstance) {
    try {
      return await withTimeout(
        clientDeleteDoc(clientDoc(clientDbInstance, collectionName, String(docId))).then(() => true),
        12000,
        false,
        `deleteFirestoreDoc[Client](${collectionName}/${docId})`
      );
    } catch (err) {
      console.warn(`[Firestore] Failed to delete document in ${collectionName}/${docId}:`, err);
      return false;
    }
  }

  return false;
}

export async function getAllFirestoreDocs<T = any>(
  collectionName: string,
  options: { failOnError?: boolean } = {}
): Promise<T[]> {
  getFirestoreDb();

  if (activeDriverMode === 'ADMIN_SDK' && adminDbInstance) {
    try {
      let snap = await withTimeout(
        adminDbInstance.collection(collectionName).get(),
        12000,
        null as any,
        `getAllFirestoreDocs[Admin](${collectionName})`
      );
      if (!snap) {
        await new Promise((r) => setTimeout(r, 1000));
        snap = await withTimeout(
          adminDbInstance.collection(collectionName).get(),
          15000,
          null as any,
          `getAllFirestoreDocs_Retry[Admin](${collectionName})`
        );
      }
      if (!snap) {
        if (options.failOnError) throw new Error(`Firestore returned no result while reading ${collectionName} after retry.`);
        return [];
      }
      const results: T[] = [];
      snap.forEach((d) => {
        results.push({ id: d.id, ...d.data() } as unknown as T);
      });
      return results;
    } catch (err: any) {
      if (err?.code === 7 || err?.message?.includes('PERMISSION_DENIED')) {
        activeDriverMode = 'CLIENT_SDK';
        return getAllFirestoreDocs<T>(collectionName, options);
      }
      console.warn(`[Firestore] Failed to list documents in ${collectionName}:`, err?.message || err);
      if (options.failOnError) throw err;
      return [];
    }
  }

  if (clientDbInstance) {
    try {
      let snap = await withTimeout(
        clientGetDocs(clientCollection(clientDbInstance, collectionName)),
        12000,
        null as any,
        `getAllFirestoreDocs[Client](${collectionName})`
      );
      if (!snap) {
        await new Promise((r) => setTimeout(r, 1000));
        snap = await withTimeout(
          clientGetDocs(clientCollection(clientDbInstance, collectionName)),
          15000,
          null as any,
          `getAllFirestoreDocs_Retry[Client](${collectionName})`
        );
      }
      if (!snap) {
        if (options.failOnError) throw new Error(`Firestore returned no result while reading ${collectionName} after retry.`);
        return [];
      }
      const results: T[] = [];
      snap.forEach((d: any) => {
        results.push({ id: d.id, ...d.data() } as unknown as T);
      });
      return results;
    } catch (err) {
      console.warn(`[Firestore] Failed to list documents in ${collectionName}:`, err);
      if (options.failOnError) throw err;
      return [];
    }
  }

  if (options.failOnError) throw new Error(`Firestore is unavailable while reading ${collectionName}.`);
  return [];
}

export async function queryFirestoreDocs<T = any>(
  collectionName: string,
  filters: Array<{ field: string; op: '==' | '<=' | '>=' | '<' | '>'; value: any }>
): Promise<T[]> {
  getFirestoreDb();

  if (activeDriverMode === 'ADMIN_SDK' && adminDbInstance) {
    try {
      let q: any = adminDbInstance.collection(collectionName);
      for (const f of filters) {
        q = q.where(f.field, f.op, f.value);
      }
      const snap = await withTimeout(
        q.get(),
        10000,
        null,
        `queryFirestoreDocs[Admin](${collectionName})`
      );
      if (!snap) {
        activeDriverMode = 'CLIENT_SDK';
        return queryFirestoreDocs<T>(collectionName, filters);
      }
      return snap.docs.map((d: any) => ({ id: d.id, ...d.data() })) as T[];
    } catch (err: any) {
      if (err?.code === 7 || err?.message?.includes('PERMISSION_DENIED')) {
        activeDriverMode = 'CLIENT_SDK';
        return queryFirestoreDocs<T>(collectionName, filters);
      }
      console.warn(`[Firestore] Query error on ${collectionName}:`, err?.message || err);
      return [];
    }
  }

  if (clientDbInstance) {
    try {
      const wheres = filters.map((f) => clientWhere(f.field, f.op as any, f.value));
      const q = clientQuery(clientCollection(clientDbInstance, collectionName), ...wheres);
      const snap = await clientGetDocs(q);
      return snap.docs.map((d: any) => ({ id: d.id, ...d.data() })) as T[];
    } catch (err) {
      console.warn(`[Firestore] Query error on ${collectionName}:`, err);
      return [];
    }
  }

  return [];
}

export async function runFirestoreTransaction<T>(
  updateFunction: (transaction: FirestoreTransactionHandler) => Promise<T>
): Promise<T> {
  getFirestoreDb();

  if (activeDriverMode === 'ADMIN_SDK' && adminDbInstance) {
    try {
      return await withTimeout(
        adminDbInstance.runTransaction(async (t) => {
          const handler: FirestoreTransactionHandler = {
            get: async (collectionName, docId) => {
              const s = await t.get(adminDbInstance!.collection(collectionName).doc(docId));
              return {
                exists: s.exists,
                id: s.id,
                data: () => s.data(),
              };
            },
            set: (collectionName, docId, data) => {
              t.set(adminDbInstance!.collection(collectionName).doc(docId), data, { merge: true });
            },
            delete: (collectionName, docId) => {
              t.delete(adminDbInstance!.collection(collectionName).doc(docId));
            },
          };
          return await updateFunction(handler);
        }),
        12000,
        null as any,
        'runFirestoreTransaction[Admin]'
      );
    } catch (err: any) {
      if (err?.code === 7 || err?.message?.includes('PERMISSION_DENIED')) {
        activeDriverMode = 'CLIENT_SDK';
        return runFirestoreTransaction<T>(updateFunction);
      }
      throw err;
    }
  }

  if (clientDbInstance) {
    return await runClientTransaction(clientDbInstance, async (t) => {
      const handler: FirestoreTransactionHandler = {
        get: async (collectionName, docId) => {
          const s = await t.get(clientDoc(clientDbInstance!, collectionName, docId));
          return {
            exists: s.exists(),
            id: s.id,
            data: () => s.data(),
          };
        },
        set: (collectionName, docId, data) => {
          t.set(clientDoc(clientDbInstance!, collectionName, docId), data, { merge: true });
        },
        delete: (collectionName, docId) => {
          t.delete(clientDoc(clientDbInstance!, collectionName, docId));
        },
      };
      return await updateFunction(handler);
    });
  }

  throw new Error('Firestore is unavailable for transaction.');
}

export async function recordTombstone(
  collectionName: string,
  docId: string,
  reason?: string,
  options: { failOnError?: boolean } = {}
): Promise<boolean> {
  const tombstoneId = `${collectionName}_${docId}`;
  const data = {
    collectionName,
    targetId: docId,
    reason: reason || 'PERMANENT_DELETION',
    deletedAt: new Date().toISOString(),
  };

  const saved = await setFirestoreDoc('tombstones', tombstoneId, data);
  if (!saved && options.failOnError) {
    throw new Error(`Firestore did not confirm the deletion tombstone for ${collectionName}/${docId}.`);
  }
  return saved;
}

export async function isTombstoned(collectionName: string, docId: string): Promise<boolean> {
  if (!docId) throw new Error('Document ID is required while checking deletion tombstone.');

  if (collectionName === 'student_profiles' || collectionName === 'student_credit_purchases' || collectionName === 'credit_ledger') {
    const userTombstone = await getFirestoreDoc('tombstones', `users_${docId}`);
    if (userTombstone) return true;
    return false;
  }

  const tombstoneId = `${collectionName}_${docId}`;
  const tombstone = await getFirestoreDoc('tombstones', tombstoneId);
  return Boolean(tombstone);
}
