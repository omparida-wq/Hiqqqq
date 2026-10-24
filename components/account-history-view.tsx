"use client";

import { useState } from "react";
import { Camera, Check, Clock3, ImagePlus, LoaderCircle, RefreshCw, Search, Trash2, Upload } from "lucide-react";
import { RequireSignIn } from "./auth-gate";
import { binForRule } from "../lib/wastewise";
import {
  loadHistory,
  retryPending,
  saveHistory,
  useAccountHistory,
  type HistoryEntry,
} from "../lib/account-history";

const LEGACY_KEY = "wastewise-history-v1"; // old, browser-only history with unknown owner

const SOURCE: Record<string, { label: string; Icon: typeof Camera }> = {
  photo: { label: "Photo", Icon: ImagePlus },
  live: { label: "Live scan", Icon: Camera },
  text: { label: "Search", Icon: Search },
  dlc: { label: "Bin station", Icon: Trash2 },
};
const when = (ms?: number) =>
  ms ? new Date(ms).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";

function EntryCard({ entry, state, error }: { entry: HistoryEntry; state?: "saving" | "failed"; error?: string }) {
  const bin = binForRule(entry.ruleId);
  const src = SOURCE[entry.source || ""];
  return (
    <article className="result-card account-entry" style={{ ["--bin" as string]: bin?.color || "#94a3b8" }}>
      <div className="account-entry-top">
        <span className="history-date">
          <Clock3 size={13} /> {when(entry.updatedAt || entry.createdAt) || "Just now"}
        </span>
        {src && <span className="entry-source"><src.Icon size={13} /> {src.label}</span>}
      </div>
      <h3>
        {entry.item} {entry.quantity && entry.quantity > 1 ? <span className="quantity">×{entry.quantity}</span> : null}
      </h3>
      <span className="bin-label"><i />{bin ? `${bin.title} · ${bin.destination}` : entry.bin || entry.category || "No bin recorded"}</span>
      {entry.condition && <p className="muted">Condition: {entry.condition}</p>}
      {entry.preparation && <p className="tip">{entry.preparation}</p>}
      {entry.quotation && (
        <details>
          <summary>Rule {entry.ruleId}</summary>
          <blockquote>“{entry.quotation}”</blockquote>
        </details>
      )}
      {state === "saving" && <p className="save-status"><LoaderCircle className="spin" size={14} /> Saving…</p>}
      {state === "failed" && (
        <p className="save-status failed">
          Not saved: {error} <button className="text-link" onClick={() => void retryPending([entry.id])}>Retry</button>
        </p>
      )}
    </article>
  );
}

function LegacyImport() {
  const [count] = useState(() => {
    try {
      const v = JSON.parse(localStorage.getItem(LEGACY_KEY) || "[]");
      return Array.isArray(v) ? v.length : 0;
    } catch {
      return 0;
    }
  });
  const [state, setState] = useState<"idle" | "busy" | "done" | "failed">("idle");
  if (!count || state === "done") return state === "done" ? <p className="save-status ok"><Check size={14} /> Imported into your account.</p> : null;
  async function run() {
    setState("busy");
    try {
      const old = JSON.parse(localStorage.getItem(LEGACY_KEY) || "[]") as { id?: string; date?: string; result?: Record<string, unknown> }[];
      const entries: HistoryEntry[] = old
        .filter((o) => o?.result && typeof o.result.item === "string")
        .map((o) => {
          const r = o.result as Record<string, unknown> & { rule?: { id?: string; text?: string } };
          return {
            id: /^[A-Za-z0-9_-]{1,100}$/.test(o.id || "") ? (o.id as string) : crypto.randomUUID(),
            item: String(r.item).slice(0, 160),
            source: "text",
            quantity: Number.isInteger(r.quantity) ? Math.min(100, Math.max(1, r.quantity as number)) : 1,
            category: typeof r.category === "string" ? r.category : undefined,
            bin: typeof r.bin === "string" ? r.bin : undefined,
            material: typeof r.material === "string" ? r.material : undefined,
            ruleId: r.rule?.id,
            quotation: r.rule?.text,
            guideVersion: "1.0",
            notes: o.date ? `Imported from this browser (originally saved ${o.date.slice(0, 10)})` : "Imported from this browser",
          };
        });
      const ok = await saveHistory(entries);
      if (!ok) throw new Error();
      localStorage.removeItem(LEGACY_KEY);
      setState("done");
    } catch {
      setState("failed");
    }
  }
  return (
    <div className="confirm-clear legacy-import">
      <span>
        {count} result{count === 1 ? " was" : "s were"} saved on this browser before accounts existed. They aren&apos;t linked to anyone.
        {state === "failed" && " Import failed. Try again."}
      </span>
      <button className="button dark" disabled={state === "busy"} onClick={() => void run()}>
        {state === "busy" ? <LoaderCircle className="spin" size={16} /> : <Upload size={16} />} Import into my account
      </button>
    </div>
  );
}

export function AccountHistoryView({ onFindFirst }: { onFindFirst: () => void }) {
  const h = useAccountHistory();
  const pending = Object.values(h.pending).filter((p) => !h.entries.some((e) => e.id === p.entry.id) || p.status === "failed");
  return (
    <section className="history-page">
      <RequireSignIn reason="Sign in to keep your sorting history in your account, on any device.">
        <div className="section-heading">
          <div>
            <h2>
              Your sorting notebook <span className="count">{h.entries.length}{h.nextCursor ? "+" : ""}</span>
            </h2>
            <p className="muted">Scan and search results save to your account automatically. No photos are stored.</p>
          </div>
          <button className="text-link" onClick={() => void loadHistory(false)} disabled={h.status === "loading"}>
            <RefreshCw size={16} /> Refresh
          </button>
        </div>
        {h.status === "ready" && <LegacyImport />}
        {(h.status === "loading" || h.status === "auth-loading") && (
          <p className="muted"><LoaderCircle className="spin" size={16} /> Loading your history…</p>
        )}
        {h.status === "error" && (
          <div className="error">
            {h.error} <button className="text-link" onClick={() => void loadHistory(false)}>Try again</button>
          </div>
        )}
        {pending.length > 0 && (
          <div className="history-grid pending-grid">
            {pending.map((p) => <EntryCard key={p.entry.id} entry={p.entry} state={p.status} error={p.error} />)}
          </div>
        )}
        {pending.some((p) => p.status === "failed") && (
          <button className="text-link" onClick={() => void retryPending()}><RefreshCw size={15} /> Retry all unsaved</button>
        )}
        {h.status === "ready" && h.entries.length === 0 && pending.length === 0 && (
          <div className="empty-state history-empty">
            <h2>Your next good choice goes here.</h2>
            <p>Search, upload a photo or scan live. Results save to your account automatically.</p>
            <button className="button dark" onClick={onFindFirst}>Find your first item</button>
          </div>
        )}
        {h.entries.length > 0 && (
          <div className="history-grid">
            {h.entries.map((e) => <EntryCard key={e.id} entry={e} />)}
          </div>
        )}
        {h.nextCursor && (
          <button className="button light load-more" disabled={h.loadingMore} onClick={() => void loadHistory(true)}>
            {h.loadingMore ? <LoaderCircle className="spin" size={16} /> : null} Load more
          </button>
        )}
        {h.status === "ready" && h.error && <p className="error">{h.error}</p>}
      </RequireSignIn>
    </section>
  );
}
