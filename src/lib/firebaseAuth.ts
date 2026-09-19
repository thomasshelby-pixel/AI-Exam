import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, User } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Request basic profile and email
googleProvider.addScope('email');
googleProvider.addScope('profile');
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

export interface GoogleAuthIdentity {
  idToken: string;
  email: string;
  fullName: string;
  photoUrl?: string;
  uid: string;
}

/**
 * Initiates the Google Sign-In popup flow via Firebase Authentication.
 * Returns the verified Google ID token and basic user claims.
 */
export async function authenticateWithGoogle(): Promise<GoogleAuthIdentity> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    const idToken = await user.getIdToken();

    return {
      idToken,
      email: user.email || '',
      fullName: user.displayName || 'CA Student',
      photoUrl: user.photoURL || undefined,
      uid: user.uid,
    };
  } catch (error: any) {
    if (error?.code === 'auth/popup-closed-by-user') {
      throw new Error('Google Sign-In was cancelled.');
    }
    if (error?.code === 'auth/popup-blocked') {
      throw new Error('Google Sign-In popup was blocked by your browser. Please allow popups for this site and try again.');
    }
    throw error;
  }
}

export const signInWithGooglePopup = authenticateWithGoogle;
