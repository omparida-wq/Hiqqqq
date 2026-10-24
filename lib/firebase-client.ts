import { getApps, initializeApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

let authPromise: Promise<Auth | null> | null = null;

/** Firebase Auth for this browser, or null when Firebase is not configured on the server. */
export function getFirebaseAuth(): Promise<Auth | null> {
  authPromise ??= fetch("/api/auth/config", { cache: "no-store" })
    .then((r) => {
      if (!r.ok) throw new Error(`Login settings could not be loaded (${r.status}).`);
      return r.json() as Promise<{ configured: boolean; apiKey?: string; authDomain?: string; projectId?: string; appId?: string }>;
    })
    .then((c) => {
      if (!c.configured) return null;
      const app =
        getApps()[0] ??
        initializeApp({ apiKey: c.apiKey, authDomain: c.authDomain, projectId: c.projectId, appId: c.appId });
      return getAuth(app);
    })
    .catch((e) => {
      authPromise = null; // allow a retry
      throw e;
    });
  return authPromise;
}

/** The signed-in user's ID token (refreshed automatically by Firebase), or null. */
export async function getIdToken(): Promise<string | null> {
  const auth = await getFirebaseAuth().catch(() => null);
  return auth?.currentUser ? auth.currentUser.getIdToken() : null;
}

export function authErrorMessage(error: unknown): string {
  const code = (error as { code?: string })?.code || "";
  const messages: Record<string, string> = {
    "auth/invalid-credential": "Email or password is incorrect.",
    "auth/wrong-password": "Email or password is incorrect.",
    "auth/user-not-found": "No account uses this email. Create one instead.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/email-already-in-use": "An account already uses this email. Sign in instead.",
    "auth/weak-password": "Use a password of at least 6 characters.",
    "auth/missing-password": "Enter your password.",
    "auth/too-many-requests": "Too many attempts. Wait a moment and try again.",
    "auth/network-request-failed": "Network error. Check your connection and try again.",
    "auth/popup-closed-by-user": "Google sign-in was closed before finishing.",
    "auth/cancelled-popup-request": "Google sign-in was cancelled.",
    "auth/popup-blocked": "Your browser blocked the Google sign-in window. Allow pop-ups and try again.",
    "auth/unauthorized-domain": "This web address isn't allowed for sign-in. Add it under Firebase Console → Authentication → Settings → Authorized domains.",
    "auth/operation-not-allowed": "This sign-in method is turned off. Enable it in Firebase Console → Authentication → Sign-in method.",
    "auth/invalid-api-key": "The Firebase API key is invalid. Check WASTEWISE_FIREBASE_API_KEY in .env.",
  };
  return messages[code] || (error instanceof Error ? error.message : "Sign-in failed. Please try again.");
}
