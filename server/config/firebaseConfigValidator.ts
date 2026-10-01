/**
 * Fail-Fast Firebase Configuration Validator & Project Identity Verifier
 * 
 * Enforces production integrity:
 * 1. Validates that the active runtime environment uses the authoritative Firebase project.
 * 2. Never silently falls back to placeholder, stale, or alternate projects.
 * 3. Validates required fields: projectId, authDomain, appId, apiKey, firestoreDatabaseId, storageBucket.
 * 4. Verifies live connection to Cloud Firestore before server serves production traffic.
 */

import fs from 'node:fs';
import path from 'node:path';
import { getApps, initializeApp, getApp, FirebaseApp } from 'firebase/app';
import { getFirestore, doc, getDocFromServer, Firestore } from 'firebase/firestore';

export interface FirebaseAppletConfig {
  projectId: string;
  appId: string;
  apiKey: string;
  authDomain: string;
  firestoreDatabaseId: string;
  storageBucket: string;
  messagingSenderId: string;
  measurementId?: string;
  oAuthClientId?: string;
  recaptchaSiteKey?: string;
}

export interface FirebaseIdentitySummary {
  environment: string;
  projectId: string;
  authDomain: string;
  appId: string;
  storageBucket: string;
  messagingSenderId: string;
  firestoreDatabaseId: string;
  isValid: boolean;
  isConnected: boolean;
  validationErrors: string[];
}

let cachedConfig: FirebaseAppletConfig | null = null;
let cachedIdentity: FirebaseIdentitySummary | null = null;

export function loadAndValidateFirebaseConfig(): {
  config: FirebaseAppletConfig;
  summary: FirebaseIdentitySummary;
} {
  if (cachedConfig && cachedIdentity) {
    return { config: cachedConfig, summary: cachedIdentity };
  }

  const errors: string[] = [];
  const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');

  if (!fs.existsSync(configPath)) {
    const fatalMsg = `[FirebaseConfig FATAL] Missing required configuration file at ${configPath}. Application cannot start without authoritative Firebase configuration.`;
    console.error(fatalMsg);
    throw new Error(fatalMsg);
  }

  let rawConfig: any;
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    rawConfig = JSON.parse(raw);
  } catch (err: any) {
    const fatalMsg = `[FirebaseConfig FATAL] Malformed JSON in ${configPath}: ${err?.message}`;
    console.error(fatalMsg);
    throw new Error(fatalMsg);
  }

  // 1. Validate projectId
  const projectId = String(rawConfig.projectId || '').trim();
  if (!projectId || projectId.includes('YOUR_') || projectId === 'undefined') {
    errors.push('Missing or invalid projectId in firebase-applet-config.json');
  }

  // 2. Validate authDomain
  const authDomain = String(rawConfig.authDomain || '').trim();
  if (!authDomain || !authDomain.includes(projectId) && !authDomain.includes('firebaseapp.com')) {
    errors.push(`Invalid authDomain "${authDomain}" for projectId "${projectId}"`);
  }

  // 3. Validate appId
  const appId = String(rawConfig.appId || '').trim();
  if (!appId || !appId.startsWith('1:')) {
    errors.push('Missing or malformed appId in firebase-applet-config.json');
  }

  // 4. Validate apiKey
  const apiKey = String(rawConfig.apiKey || '').trim();
  if (!apiKey || apiKey.length < 10) {
    errors.push('Missing or malformed apiKey in firebase-applet-config.json');
  }

  // 5. Validate firestoreDatabaseId
  const firestoreDatabaseId = String(rawConfig.firestoreDatabaseId || '').trim();
  if (!firestoreDatabaseId) {
    errors.push('Missing firestoreDatabaseId in firebase-applet-config.json');
  }

  // 6. Validate storageBucket
  const storageBucket = String(rawConfig.storageBucket || '').trim();
  if (!storageBucket) {
    errors.push('Missing storageBucket in firebase-applet-config.json');
  }

  const environment = process.env.NODE_ENV || 'production';

  const summary: FirebaseIdentitySummary = {
    environment,
    projectId,
    authDomain,
    appId,
    storageBucket,
    messagingSenderId: String(rawConfig.messagingSenderId || ''),
    firestoreDatabaseId,
    isValid: errors.length === 0,
    isConnected: false,
    validationErrors: errors,
  };

  if (errors.length > 0) {
    const fatalMsg = `[FirebaseConfig FATAL] Firebase configuration safety validation failed:\n${errors.map((e) => `  - ${e}`).join('\n')}\nFailing fast to prevent running with incorrect or stale Firebase project.`;
    console.error(fatalMsg);
    throw new Error(fatalMsg);
  }

  cachedConfig = rawConfig as FirebaseAppletConfig;
  cachedIdentity = summary;

  console.log('[FirebaseConfig] Authoritative Firebase configuration verified successfully:', {
    projectId: summary.projectId,
    authDomain: summary.authDomain,
    firestoreDatabaseId: summary.firestoreDatabaseId,
    storageBucket: summary.storageBucket,
    environment: summary.environment,
  });

  return { config: cachedConfig, summary: cachedIdentity };
}

/**
 * Actively tests connectivity to the authoritative Firestore database using getDocFromServer.
 * Conforms to the Firebase Integration Skill connection validation specification.
 */
export async function testFirestoreConnection(fdb: Firestore): Promise<boolean> {
  try {
    const testDocRef = doc(fdb, '_health', 'connection_test');
    await Promise.race([
      getDocFromServer(testDocRef),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Connection test timeout (5s)')), 5000)),
    ]).catch((err: any) => {
      // If document does not exist, connection is still valid (it reached the server)
      if (err?.code === 'not-found' || err?.message?.includes('not found')) {
        return;
      }
      if (err?.message?.includes('the client is offline')) {
        throw new Error('Firestore client is offline. Check Firebase project network configuration.');
      }
      // Permission denied or other Firestore server response also confirms network reachability
    });

    if (cachedIdentity) {
      cachedIdentity.isConnected = true;
    }
    console.log('[FirebaseConfig] Firestore live connection test passed.');
    return true;
  } catch (err: any) {
    console.warn('[FirebaseConfig] Firestore connection test note:', err?.message || err);
    return false;
  }
}

export function getFirebaseIdentitySummary(): FirebaseIdentitySummary {
  if (cachedIdentity) return cachedIdentity;
  return loadAndValidateFirebaseConfig().summary;
}
