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

let firestoreInstance: Firestore | null = null;
let initAttempted = false;

export function getFirestoreDb(): Firestore | null {
  if (firestoreInstance) return firestoreInstance;
  if (initAttempted && !firestoreInstance) return null;

  initAttempted = true;
  try {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(raw);
      const app = getApps().length === 0 ? initializeApp(config) : getApp();
      firestoreInstance = config.firestoreDatabaseId
        ? getFirestore(app, config.firestoreDatabaseId)
        : getFirestore(app);
      console.log('[Firestore] Successfully initialized database:', config.firestoreDatabaseId || '(default)');
      return firestoreInstance;
    }
  } catch (err) {
    console.warn('[Firestore] Initialization error:', err);
  }
  return null;
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
    await setDoc(doc(db, collectionName, String(docId)), cleanData, { merge: true });
    return true;
  } catch (err) {
    console.warn(`[Firestore] Failed to set document in ${collectionName}/${docId}:`, err);
    return false;
  }
}

export async function getFirestoreDoc<T = DocumentData>(collectionName: string, docId: string): Promise<T | null> {
  const db = getFirestoreDb();
  if (!db || !docId) return null;
  try {
    const snap = await getDoc(doc(db, collectionName, String(docId)));
    if (!snap.exists()) return null;
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
    await deleteDoc(doc(db, collectionName, String(docId)));
    return true;
  } catch (err) {
    console.warn(`[Firestore] Failed to delete document in ${collectionName}/${docId}:`, err);
    return false;
  }
}

export async function getAllFirestoreDocs<T = DocumentData>(collectionName: string): Promise<T[]> {
  const db = getFirestoreDb();
  if (!db) return [];
  try {
    const snap = await getDocs(collection(db, collectionName));
    const results: T[] = [];
    snap.forEach((d) => {
      results.push({ id: d.id, ...d.data() } as unknown as T);
    });
    return results;
  } catch (err) {
    console.warn(`[Firestore] Failed to list documents in ${collectionName}:`, err);
    return [];
  }
}

// Tombstones: Ensure permanent deletions survive restarts and prevent re-seeding
export async function recordTombstone(collectionName: string, docId: string, reason?: string): Promise<void> {
  const db = getFirestoreDb();
  if (!db || !docId) return;
  try {
    const tombstoneId = `${collectionName}_${docId}`;
    await setDoc(doc(db, 'tombstones', tombstoneId), {
      collectionName,
      targetId: docId,
      reason: reason || 'PERMANENT_DELETION',
      deletedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.warn(`[Firestore] Failed to record tombstone for ${collectionName}/${docId}:`, err);
  }
}

export async function isTombstoned(collectionName: string, docId: string): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db || !docId) return false;
  try {
    const tombstoneId = `${collectionName}_${docId}`;
    const snap = await getDoc(doc(db, 'tombstones', tombstoneId));
    return snap.exists();
  } catch {
    return false;
  }
}
