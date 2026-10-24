"use client";

import { createContext, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type Auth,
  type User,
} from "firebase/auth";
import { LoaderCircle, LogOut } from "lucide-react";
import { authErrorMessage, getFirebaseAuth } from "../lib/firebase-client";
import { historyAuthLoading, historySetUser, historySignedOut } from "../lib/account-history";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "unconfigured" }
  | { status: "signedOut"; auth: Auth }
  | { status: "signedIn"; auth: Auth; user: User };
type AuthValue = State & { retry: () => void };

const AuthContext = createContext<AuthValue>({ status: "loading", retry: () => {} });
export const useAuth = () => useContext(AuthContext);

/** Tracks the Firebase sign-in state for the whole app. Signing in is optional; only Rewards needs it. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let unsubscribe = () => {};
    let cancelled = false;
    getFirebaseAuth()
      .then((auth) => {
        if (cancelled) return;
        if (!auth) return setState({ status: "unconfigured" });
        unsubscribe = onAuthStateChanged(auth, (user) =>
          setState(user ? { status: "signedIn", auth, user } : { status: "signedOut", auth }),
        );
      })
      .catch((e) => !cancelled && setState({ status: "error", message: authErrorMessage(e) }));
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [attempt]);

  // Account-scoped data follows the verified session: cleared at once on logout/switch,
  // loaded only after the account is known.
  const uid = state.status === "signedIn" ? state.user.uid : null;
  useEffect(() => {
    if (state.status === "loading") historyAuthLoading();
    else if (state.status === "signedIn") historySetUser(state.user);
    else historySignedOut();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status, uid]);

  const value: AuthValue = { ...state, retry: () => { setState({ status: "loading" }); setAttempt((n) => n + 1); } };
  return (
    <AuthContext.Provider value={value}>
      {children}
      {state.status === "signedIn" && <AccountChip auth={state.auth} user={state.user} />}
    </AuthContext.Provider>
  );
}

/** Shows its children only to signed-in users; otherwise an inline sign-in card. */
export function RequireSignIn({ children, reason }: { children: ReactNode; reason: string }) {
  const a = useAuth();
  if (a.status === "signedIn") return <>{children}</>;
  return (
    <section className="auth-inline">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="auth-logo" aria-hidden="true">✳</span> WasteWise
        </div>
        {a.status === "loading" && (
          <p className="auth-status" role="status">
            <LoaderCircle className="auth-spin" size={18} aria-hidden="true" /> Checking your sign-in…
          </p>
        )}
        {a.status === "error" && (
          <>
            <h1>Sign-in is unavailable</h1>
            <p className="auth-error" role="alert">{a.message}</p>
            <button className="auth-primary" onClick={a.retry}>Try again</button>
          </>
        )}
        {a.status === "unconfigured" && (
          <>
            <h1>Login is not set up yet</h1>
            <p className="auth-muted">
              Add the <code>WASTEWISE_FIREBASE_*</code> settings to <code>.env</code> and restart the app.
            </p>
          </>
        )}
        {a.status === "signedOut" && <SignInForm auth={a.auth} intro={reason} />}
      </div>
    </section>
  );
}

function SignInForm({ auth, intro }: { auth: Auth; intro?: string }) {
  const [mode, setMode] = useState<"signIn" | "signUp" | "reset">("signIn");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (mode === "reset")
      return run(async () => {
        await sendPasswordResetEmail(auth, email.trim());
        setNotice("If an account uses this email, a reset link is on its way. Check your inbox.");
      });
    if (mode === "signUp")
      return run(async () => {
        const { user } = await createUserWithEmailAndPassword(auth, email.trim(), password);
        if (name.trim()) await updateProfile(user, { displayName: name.trim() });
      });
    return run(() => signInWithEmailAndPassword(auth, email.trim(), password));
  };

  const google = () => run(() => signInWithPopup(auth, new GoogleAuthProvider()));

  const title = mode === "signUp" ? "Create your account" : mode === "reset" ? "Reset your password" : "Welcome back";
  return (
    <>
      <h1 id="auth-title">{title}</h1>
      <p className="auth-muted">
        {mode === "reset" ? "We'll email you a link to choose a new password." : intro || "Sign in to continue."}
      </p>
      <form className="auth-form" onSubmit={submit} noValidate>
        {mode === "signUp" && (
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Your name" />
          </label>
        )}
        <label>
          Email
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@example.com" />
        </label>
        {mode !== "reset" && (
          <label>
            Password
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "signUp" ? "new-password" : "current-password"}
              placeholder={mode === "signUp" ? "At least 6 characters" : "Your password"}
            />
          </label>
        )}
        {error && <p className="auth-error" role="alert">{error}</p>}
        {notice && <p className="auth-notice" role="status">{notice}</p>}
        <button className="auth-primary" type="submit" disabled={busy}>
          {busy && <LoaderCircle className="auth-spin" size={16} aria-hidden="true" />}
          {mode === "signUp" ? "Create account" : mode === "reset" ? "Send reset link" : "Sign in"}
        </button>
      </form>
      {mode !== "reset" && (
        <>
          <div className="auth-divider"><span>or</span></div>
          <button className="auth-google" onClick={google} disabled={busy}>
            <GoogleMark /> Continue with Google
          </button>
        </>
      )}
      <div className="auth-switch">
        {mode === "signIn" && (
          <>
            <button onClick={() => setMode("reset")}>Forgot password?</button>
            <span>New here? <button onClick={() => setMode("signUp")}>Create an account</button></span>
          </>
        )}
        {mode !== "signIn" && <button onClick={() => setMode("signIn")}>Back to sign in</button>}
      </div>
    </>
  );
}

function AccountChip({ auth, user }: { auth: Auth; user: User }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  const label = user.displayName || user.email || "Account";
  const initials = label.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
  return (
    <div className="auth-chip" ref={ref}>
      <button className="auth-avatar" aria-haspopup="true" aria-expanded={open} aria-label={`Account: ${label}`} onClick={() => setOpen((o) => !o)}>
        {user.photoURL ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" /> : initials}
      </button>
      {open && (
        <div className="auth-menu" role="menu">
          <strong>{user.displayName || "Signed in"}</strong>
          {user.email && <span>{user.email}</span>}
          <button role="menuitem" onClick={() => signOut(auth)}>
            <LogOut size={15} aria-hidden="true" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.8 6C12.4 13.7 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.8c4.3-4 6.9-9.9 6.9-17.2z" />
      <path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.2.8-4.7l-7.8-6C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.8-6z" />
      <path fill="#34A853" d="M24 48c6.2 0 11.5-2 15.3-5.5l-7.4-5.8c-2 1.4-4.7 2.3-7.9 2.3-6.3 0-11.6-4.2-13.5-10l-7.8 6C6.6 42.6 14.6 48 24 48z" />
    </svg>
  );
}
