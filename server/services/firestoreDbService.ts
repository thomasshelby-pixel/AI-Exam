import fs from 'node:fs';
import path from 'node:path';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  getDocs,
  query,
  where,
  Firestore,
  DocumentData,
} from 'firebase/firestore';

import { loadAndValidateFirebaseConfig } from '../config/firebaseConfigValidator.js';

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

async function withTimeout<T>(promise: Promise<T>, ms: number = 12000, fallback: T, operationName: string = 'Firestore operation'): Promise<T> {
  let timeoutHandle: any;
  const timeoutPromise = new Promise<T>((resolve) => {
    timeoutHandle = setTimeout(() => {
      console.warn(`[Firestore TIMEOUT] ${operationName} exceeded ${ms}ms threshold; applying fallback.`);
      resolve(fallback);
    }, ms);
  });

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

export async function getFirestoreDoc<T = DocumentData>(collectionName: string, docId: string): Promise<T | null> {
  const db = getFirestoreDb();
  if (!db || !docId) return null;
  try {
    const snap = await withTimeout(
      getDoc(doc(db, collectionName, String(docId))),
      12000,
      null as any,
      `getFirestoreDoc(${collectionName}/${docId})`
    );
    if (!snap || !snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as unknown as T;
  } catch (err) {
    console.warn(`[Firestore] Failed to get document in ${collectionName}/${docId}:`, err);
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
export async function recordTombstone(collectionName: string, docId: string, reason?: string): Promise<void> {
  const db = getFirestoreDb();
  if (!db || !docId) return;
  try {
    const tombstoneId = `${collectionName}_${docId}`;
    await withTimeout(
      setDoc(doc(db, 'tombstones', tombstoneId), {
        collectionName,
        targetId: docId,
        reason: reason || 'PERMANENT_DELETION',
        deletedAt: new Date().toISOString(),
      }),
      2500,
      undefined
    );
  } catch (err) {
    console.warn(`[Firestore] Failed to record tombstone for ${collectionName}/${docId}:`, err);
  }
}

export async function isTombstoned(collectionName: string, docId: string): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db || !docId) return false;
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
      2500,
      null
    );
    return Boolean(snap && snap.exists());
  } catch {
    return false;
  }
}
