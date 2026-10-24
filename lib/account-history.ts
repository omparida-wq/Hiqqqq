// Account-scoped history: the signed-in user's own entries from the backend (GET/POST /api/history,
// through this app's server, which uses that user's member token).
//
// Isolation rules:
// - One owner (Firebase uid) and one login *generation* at a time. Every request captures both and
//   its result is applied only if they are still current, so a late answer for user A can never
//   appear after logout or after switching to user B. Requests are also aborted.
// - Each save is sent with the owner's own ID token and only while that same user is signed in.
// - Unsaved entries wait in a per-user queue (localStorage, keyed by uid, no tokens) and are retried
//   only after that same user signs in again. Another account never sees or sends them.
// - Logout clears everything on screen at once and never deletes anything on the backend.
import type { User } from "firebase/auth";
import { useSyncExternalStore } from "react";

export type HistorySource = "photo" | "text" | "live" | "dlc";
export type HistoryEntry = {
  id: string;
  item: string;
  source?: HistorySource;
  quantity?: number;
  material?: string;
  category?: string;
  bin?: string;
  ruleId?: string;
  guideVersion?: string;
  preparation?: string;
  quotation?: string;
  condition?: string;
  notes?: string;
  scanId?: string;
  createdAt?: number;
  updatedAt?: number;
};
export type PendingSave = { entry: HistoryEntry; status: "saving" | "failed"; error?: string };
export type HistoryState = {
  status: "auth-loading" | "signed-out" | "loading" | "ready" | "error";
  uid: string | null;
  entries: HistoryEntry[]; // confirmed by the backend
  pending: Record<string, PendingSave>; // not yet confirmed
  nextCursor: string | null;
  loadingMore: boolean;
  error: string;
  errorCode: string;
};

export class HistoryApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(message: string, status: number, code = "") {
    super(message);
    this.status = status;
    this.code = code;
  }
}
class StaleRequest extends Error {}

const empty = (status: HistoryState["status"], uid: string | null = null): HistoryState => ({
  status, uid, entries: [], pending: {}, nextCursor: null, loadingMore: false, error: "", errorCode: "",
});
let state: HistoryState = empty("auth-loading");
let owner: { uid: string; user: User } | null = null;
let generation = 0;
const controllers = new Set<AbortController>();
const listeners = new Set<() => void>();
const SEND_FIELDS = ["id", "item", "source", "quantity", "material", "category", "bin", "ruleId", "guideVersion", "preparation", "quotation", "condition", "notes", "scanId"] as const;
const PAGE_SIZE = 50;
const queueKey = (uid: string) => `wastewise-history-queue:${uid}`;

function set(next: Partial<HistoryState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
export function useAccountHistory() {
  return useSyncExternalStore(subscribe, () => state, () => state);
}
export const historySnapshot = () => state;

function reset(status: HistoryState["status"], uid: string | null) {
  generation++;
  controllers.forEach((c) => c.abort());
  controllers.clear();
  state = empty(status, uid);
  listeners.forEach((l) => l());
}

// ---------- per-user retry queue (no tokens) ----------
function readQueue(uid: string): Record<string, HistoryEntry> {
  try {
    const v = JSON.parse(localStorage.getItem(queueKey(uid)) || "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}
function writeQueue(uid: string, q: Record<string, HistoryEntry>) {
  try {
    if (Object.keys(q).length) localStorage.setItem(queueKey(uid), JSON.stringify(q));
    else localStorage.removeItem(queueKey(uid));
  } catch { /* storage unavailable: pending entries stay in memory for this visit */ }
}

// ---------- requests ----------
async function call<T>(uid: string, gen: number, path: string, init: RequestInit = {}, timeoutMs = 20_000): Promise<T> {
  const live = () => owner?.uid === uid && generation === gen && owner.user.uid === uid;
  if (!live()) throw new StaleRequest();
  const token = await owner!.user.getIdToken();
  if (!live()) throw new StaleRequest();
  const c = new AbortController();
  controllers.add(c);
  const timer = setTimeout(() => c.abort(new DOMException("timeout", "TimeoutError")), timeoutMs);
  try {
    let res: Response;
    try {
      res = await fetch(`/api/wastewise/${path}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
          "x-api-client": "wastewise",
          Authorization: `Bearer ${token}`,
        },
        signal: c.signal,
        cache: "no-store",
      });
    } catch (e) {
      if (!live()) throw new StaleRequest();
      throw new HistoryApiError((e as Error)?.name === "TimeoutError" || c.signal.reason?.name === "TimeoutError" ? "The server took too long to answer." : "Network problem. Check your connection.", 0, "NETWORK");
    }
    const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
    if (!live()) throw new StaleRequest();
    if (!res.ok) {
      const fallback: Record<number, string> = {
        401: "Sign in again to connect your account.",
        400: "This result could not be saved (invalid entry).",
        413: "This result is too large to save.",
        503: "History storage is unavailable right now.",
      };
      throw new HistoryApiError(data.error || fallback[res.status] || `The server answered ${res.status}.`, res.status, data.code || "");
    }
    return data as T;
  } finally {
    clearTimeout(timer);
    controllers.delete(c);
  }
}

// ---------- auth lifecycle ----------
export function historyAuthLoading() {
  if (state.status !== "auth-loading" || owner) { owner = null; reset("auth-loading", null); }
}
export function historySignedOut() {
  if (state.status !== "signed-out" || owner) { owner = null; reset("signed-out", null); }
}
export function historySetUser(user: User) {
  if (owner?.uid === user.uid) { owner = { uid: user.uid, user }; return; }
  owner = { uid: user.uid, user };
  reset("loading", user.uid);
  // Show this user's own unsent entries (from an earlier visit) as pending.
  const queued = readQueue(user.uid);
  const pending: Record<string, PendingSave> = {};
  for (const [id, entry] of Object.entries(queued)) pending[id] = { entry, status: "saving" };
  set({ pending });
  void loadHistory(false).then(() => {
    if (owner?.uid === user.uid && Object.keys(queued).length) void saveHistory(Object.values(queued));
  });
}

export async function loadHistory(more: boolean) {
  if (!owner) return;
  const uid = owner.uid, gen = generation;
  if (more && (!state.nextCursor || state.loadingMore)) return;
  set(more ? { loadingMore: true } : { status: "loading", error: "", errorCode: "" });
  try {
    const q = `history?limit=${PAGE_SIZE}${more && state.nextCursor ? `&cursor=${encodeURIComponent(state.nextCursor)}` : ""}`;
    const data = await call<{ entries?: HistoryEntry[]; nextCursor?: string | null }>(uid, gen, q);
    const got = Array.isArray(data.entries) ? data.entries.filter((e) => e && typeof e.id === "string") : [];
    const merged = more ? [...state.entries, ...got.filter((e) => !state.entries.some((x) => x.id === e.id))] : got;
    set({ status: "ready", entries: merged, nextCursor: typeof data.nextCursor === "string" && data.nextCursor ? data.nextCursor : null, loadingMore: false, error: "", errorCode: "" });
  } catch (e) {
    if (e instanceof StaleRequest) return;
    const err = e as HistoryApiError;
    set(more ? { loadingMore: false, error: err.message, errorCode: err.code } : { status: "error", error: err.message, errorCode: err.code || String(err.status || "") });
  }
}

/** Keep only the fields the backend accepts; never photos, tokens or raw model output. */
export function cleanEntry(e: HistoryEntry): HistoryEntry {
  const out: Record<string, unknown> = {};
  for (const f of SEND_FIELDS) {
    const v = e[f];
    if (v === undefined || v === null || v === "") continue;
    out[f] = typeof v === "string" ? v.slice(0, f === "item" ? 160 : 2000) : v;
  }
  return out as HistoryEntry;
}
function batches(list: HistoryEntry[]): HistoryEntry[][] {
  const out: HistoryEntry[][] = [];
  let cur: HistoryEntry[] = [];
  for (const e of list) {
    const next = [...cur, e];
    if (cur.length && (next.length > 30 || new TextEncoder().encode(JSON.stringify({ entries: next })).length > 15_000)) {
      out.push(cur);
      cur = [e];
    } else cur = next;
  }
  if (cur.length) out.push(cur);
  return out;
}

/** Saves (or updates, by id) entries for the signed-in user. Returns false when nobody is signed in. */
export async function saveHistory(entries: HistoryEntry[]): Promise<boolean> {
  if (!owner || !entries.length) return false;
  const uid = owner.uid, gen = generation;
  const clean = entries.map(cleanEntry).filter((e) => e.id && e.item);
  const queue = readQueue(uid);
  const pending = { ...state.pending };
  for (const e of clean) {
    queue[e.id] = e;
    pending[e.id] = { entry: e, status: "saving" };
  }
  writeQueue(uid, queue);
  set({ pending });
  let ok = true;
  for (const batch of batches(clean)) {
    try {
      await call(uid, gen, "history", { method: "POST", body: JSON.stringify(batch.length === 1 ? batch[0] : { entries: batch }) });
      // Confirmed by the backend: drop from this user's queue even if they have since logged out.
      const q = readQueue(uid);
      for (const e of batch) if (JSON.stringify(q[e.id]) === JSON.stringify(e)) delete q[e.id]; // keep newer corrections
      writeQueue(uid, q);
      if (owner?.uid === uid && generation === gen) {
        const now = Date.now();
        const entriesNow = [...state.entries];
        for (const e of batch) {
          const i = entriesNow.findIndex((x) => x.id === e.id);
          if (i >= 0) entriesNow[i] = { ...entriesNow[i], ...e, updatedAt: now };
          else entriesNow.unshift({ ...e, createdAt: now, updatedAt: now });
        }
        const p = { ...state.pending };
        for (const e of batch) if (p[e.id]?.entry === e || JSON.stringify(p[e.id]?.entry) === JSON.stringify(e)) delete p[e.id];
        set({ entries: entriesNow, pending: p });
      }
    } catch (err) {
      ok = false;
      if (err instanceof StaleRequest) continue; // stays in this user's queue for their next login
      if (owner?.uid === uid && generation === gen) {
        const p = { ...state.pending };
        for (const e of batch) p[e.id] = { entry: e, status: "failed", error: (err as Error).message };
        set({ pending: p });
      }
    }
  }
  return ok;
}

export function retryPending(ids?: string[]) {
  const list = Object.values(state.pending).filter((p) => p.status === "failed" && (!ids || ids.includes(p.entry.id))).map((p) => p.entry);
  return saveHistory(list);
}

/** For tests only. */
export function __historyTestHooks() {
  return { reset: () => { owner = null; reset("auth-loading", null); }, get generation() { return generation; } };
}
