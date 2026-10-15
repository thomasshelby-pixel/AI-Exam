import fs from 'node:fs';
import path from 'node:path';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  writeBatch,
  deleteDoc,
  collection,
  getDocs,
  query,
  where,
  Firestore,
  DocumentData,
  terminate,
  setLogLevel,
} from 'firebase/firestore';
import { setUserLogHandler } from '@firebase/logger';

import { loadAndValidateFirebaseConfig } from '../config/firebaseConfigValidator.js';

// Suppress benign internal gRPC stream cancellations (e.g. idle stream Code 1 CANCELLED)
// that occur during normal stream recycling or server idle periods.
try {
  setLogLevel('error');
  setUserLogHandler((logEntry) => {
    const msg = logEntry.message || '';
    if (
      msg.includes('1 CANCELLED') ||
      msg.includes('Call cancelled') ||
      (msg.includes("RPC 'Listen' stream") && msg.includes('Code: 1')) ||
      (msg.includes("RPC 'Write' stream") && msg.includes('Code: 1'))
    ) {
      return;
    }
    if (logEntry.level === 'error') {
      console.error(`[${logEntry.type || 'Firestore'}] ${msg}`);
    } else if (logEntry.level === 'warn') {
      console.warn(`[${logEntry.type || 'Firestore'}] ${msg}`);
    }
  });
} catch {
  // Safe fallback if logger cannot be customized
}

let firestoreInstance: Firestore | null = null;
let initAttempted = false;

export function getFirestoreDb(): Firestore | null {
  if (firestoreInstance) return firestoreInstance;
  if (initAttempted && !firestoreInstance) return null;

  initAttempted = true;
  try {
    const { config } = loadAndValidateFirebaseConfig();
    const app = getApps().length === 0 ? initializeApp(config) : getApp();
    firestoreInstance = config.firestoreDatabaseId
      ? getFirestore(app, config.firestoreDatabaseId)
      : getFirestore(app);
    console.log('[Firestore] Successfully initialized database:', config.firestoreDatabaseId || '(default)');
    return firestoreInstance;
  } catch (err: any) {
    console.error('[Firestore FATAL] Initialization error:', err?.message || err);
    throw err;
  }
}

export async function closeFirestoreCleanly(): Promise<void> {
  if (firestoreInstance) {
    try {
      await terminate(firestoreInstance);
      console.log('[Firestore] Cleanly terminated database connection.');
    } catch {
      // Ignore cleanup error on process exit
    }
    firestoreInstance = null;
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number = 12000, fallback: T, operationName: string = 'Firestore operation'): Promise<T> {
  let timeoutHandle: any;
  const timeoutPromise = new Promise<T>((resolve) => {
    timeoutHandle = setTimeout(() => {
      console.warn(`[Firestore TIMEOUT] ${operationName} exceeded ${ms}ms threshold; applying fallback.`);
      resolve(fallback);
    }, ms);
  });

  // Attach a silent catch handler to promise so that if it finishes/rejects after timeout,
  // it never triggers an unhandled promise rejection or unhandled stream error.
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

export async function setFirestoreDoc(collectionName: string, docId: string, data: Record<string, any>): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db || !docId) return false;
  try {
    const cleanData: Record<string, any> = {};
    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined) {
        cleanData[k] = v;
      }
    }
    cleanData._updatedAt = new Date().toISOString();
    return await withTimeout(
      setDoc(doc(db, collectionName, String(docId)), cleanData, { merge: true }).then(() => true),
      12000,
      false,
      `setFirestoreDoc(${collectionName}/${docId})`
    );
  } catch (err) {
    console.warn(`[Firestore] Failed to set document in ${collectionName}/${docId}:`, err);
    return false;
  }
}

export async function setFirestoreDocsAtomically(
  writes: Array<{ collectionName: string; docId: string; data: Record<string, any> }>
): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db || writes.length === 0 || writes.some((write) => !write.docId)) return false;
  try {
    const batch = writeBatch(db);
    for (const write of writes) {
      const cleanData: Record<string, any> = {};
      for (const [key, value] of Object.entries(write.data)) {
        if (value !== undefined) cleanData[key] = value;
      }
      cleanData._updatedAt = new Date().toISOString();
      batch.set(doc(db, write.collectionName, String(write.docId)), cleanData, { merge: true });
    }
    return await withTimeout(
      batch.commit().then(() => true),
      12000,
      false,
      'setFirestoreDocsAtomically'
    );
  } catch (err) {
    console.warn('[Firestore] Failed to atomically persist protected records:', err);
    return false;
  }
}

export async function getFirestoreDoc<T = DocumentData>(
  collectionName: string,
  docId: string,
  options: { failOnError?: boolean } = {}
): Promise<T | null> {
  const firestore = getFirestoreDb();
  if (!firestore || !docId) {
    const error = new Error(`Firestore is unavailable while reading ${collectionName}/${docId}.`);
    if (options.failOnError) throw error;
    return null;
  }
  try {
    const snap = await withTimeout(
      getDoc(doc(firestore, collectionName, String(docId))),
      12000,
      null as any,
      `getFirestoreDoc(${collectionName}/${docId})`
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
export async function deleteFirestoreDoc(collectionName: string, docId: string): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db || !docId) return false;
  try {
    return await withTimeout(
      deleteDoc(doc(db, collectionName, String(docId))).then(() => true),
      12000,
      false,
      `deleteFirestoreDoc(${collectionName}/${docId})`
    );
  } catch (err) {
    console.warn(`[Firestore] Failed to delete document in ${collectionName}/${docId}:`, err);
    return false;
  }
}
export async function getAllFirestoreDocs<T = DocumentData>(
  collectionName: string,
  options: { failOnError?: boolean } = {}
): Promise<T[]> {
  const db = getFirestoreDb();
  if (!db) {
    if (options.failOnError) throw new Error(`Firestore is unavailable while reading ${collectionName}.`);
    return [];
  }
  try {
    let snap = await withTimeout(
      getDocs(collection(db, collectionName)),
      12000,
      null as any,
      `getAllFirestoreDocs(${collectionName})`
    );

    // If initial query timed out on cold start, retry once with backoff
    if (!snap) {
      console.log(`[Firestore] Retrying getAllFirestoreDocs for ${collectionName}...`);
      await new Promise((r) => setTimeout(r, 1000));
      snap = await withTimeout(
        getDocs(collection(db, collectionName)),
        15000,
        null as any,
        `getAllFirestoreDocs_Retry(${collectionName})`
      );
    }

    if (!snap) {
      console.warn(`[Firestore WARN] Failed to retrieve documents from ${collectionName} after retry.`);
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

// Tombstones: Ensure permanent deletions survive restarts and prevent re-seeding
export async function recordTombstone(
  collectionName: string,
  docId: string,
  reason?: string,
  options: { failOnError?: boolean } = {}
): Promise<boolean> {
  const firestore = getFirestoreDb();
  if (!firestore || !docId) {
    const error = new Error(`Firestore is unavailable while recording a deletion tombstone for ${collectionName}/${docId}.`);
    if (options.failOnError) throw error;
    return false;
  }
  try {
    const tombstoneId = `${collectionName}_${docId}`;
    const recorded = await withTimeout(
      setDoc(doc(firestore, 'tombstones', tombstoneId), {
        collectionName,
        targetId: docId,
        reason: reason || 'PERMANENT_DELETION',
        deletedAt: new Date().toISOString(),
      }).then(() => true),
      12000,
      false,
      `recordTombstone(${collectionName}/${docId})`
    );
    if (!recorded && options.failOnError) {
      throw new Error(`Firestore did not confirm the deletion tombstone for ${collectionName}/${docId}.`);
    }
    return recorded;
  } catch (err) {
    console.warn(`[Firestore] Failed to record tombstone for ${collectionName}/${docId}:`, err);
    if (options.failOnError) throw err;
    return false;
  }
}
export async function isTombstoned(collectionName: string, docId: string): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db || !docId) throw new Error('Firestore is unavailable while checking a deletion tombstone.');
  try {
    // For credit-related collections, never block updates unless the entire user account is tombstoned
    if (collectionName === 'student_profiles' || collectionName === 'student_credit_purchases' || collectionName === 'credit_ledger') {
      const userTombstoneSnap = await withTimeout(
        getDoc(doc(db, 'tombstones', `users_${docId}`)),
        2500,
        null
      );
      if (userTombstoneSnap && userTombstoneSnap.exists()) {
        return true;
      }
      return false;
    }

    const tombstoneId = `${collectionName}_${docId}`;
    const snap = await withTimeout(
      getDoc(doc(db, 'tombstones', tombstoneId)),
      12000,
      null,
      `isTombstoned(${collectionName}/${docId})`
    );
    if (!snap) throw new Error(`Timed out checking tombstone for ${collectionName}/${docId}.`);
    return Boolean(snap && snap.exists());
  } catch (err) {
    console.error(`[Firestore] Could not verify tombstone state for ${collectionName}/${docId}:`, err);
    throw err;
  }
}
