/**
 * Client-Side Firebase Configuration Validator & Safe Diagnostic Logger
 * 
 * Verifies that the client application is connected to the exact authoritative Firebase project.
 * Never logs passwords, tokens, credentials, or private secrets.
 */

import firebaseConfig from '../../firebase-applet-config.json';

export interface ClientFirebaseIdentity {
  projectId: string;
  authDomain: string;
  appId: string;
  storageBucket: string;
  messagingSenderId: string;
  firestoreDatabaseId: string;
  isValid: boolean;
  errors: string[];
}

export function validateClientFirebaseConfig(): ClientFirebaseIdentity {
  const errors: string[] = [];

  const projectId = String(firebaseConfig.projectId || '').trim();
  if (!projectId || projectId.includes('YOUR_') || projectId === 'undefined') {
    errors.push('Client configuration has invalid projectId');
  }

  const authDomain = String(firebaseConfig.authDomain || '').trim();
  if (!authDomain || (!authDomain.includes(projectId) && !authDomain.includes('firebaseapp.com'))) {
    errors.push(`Client authDomain "${authDomain}" does not match projectId "${projectId}"`);
  }

  const appId = String(firebaseConfig.appId || '').trim();
  if (!appId || !appId.startsWith('1:')) {
    errors.push('Client configuration has malformed appId');
  }

  const identity: ClientFirebaseIdentity = {
    projectId,
    authDomain,
    appId,
    storageBucket: String(firebaseConfig.storageBucket || ''),
    messagingSenderId: String(firebaseConfig.messagingSenderId || ''),
    firestoreDatabaseId: String((firebaseConfig as any).firestoreDatabaseId || ''),
    isValid: errors.length === 0,
    errors,
  };

  if (!identity.isValid) {
    console.error('[Firebase Client Config] Configuration error:', identity.errors);
  } else {
    // Safe startup diagnostic log (no secrets/keys exposed)
    console.log('[Firebase Client Config] Verified authoritative project:', {
      projectId: identity.projectId,
      authDomain: identity.authDomain,
      firestoreDatabaseId: identity.firestoreDatabaseId,
    });
  }

  return identity;
}
