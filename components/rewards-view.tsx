"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCheck, Clock3, Gift, LoaderCircle, RefreshCw, Trash2, X } from "lucide-react";
import {
  BINS,
  rewardsApi,
  type DisposalBin,
  type DisposalSession,
  type RewardAccount,
  type RewardTransaction,
} from "../lib/wastewise";

const DONE = /^(confirmed|completed|complete|credited|deposited|verified|success|succeeded|approved|accepted)$/i;
const FAILED = /^(expired|failed|rejected|cancelled|canceled|timeout|timed_out|invalid|error)$/i;
const POLL_MS = 3000;
const POLL_LIMIT_MS = 10 * 60 * 1000;

const pick = (o: Record<string, unknown> | null | undefined, ...keys: string[]) => {
  for (const k of keys) if (o && o[k] !== undefined && o[k] !== null && o[k] !== "") return o[k];
  return undefined;
};
const asNumber = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() && !isNaN(Number(v)) ? Number(v) : undefined);
const asText = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v) : undefined);
const when = (v: unknown) => {
  const d = typeof v === "string" || typeof v === "number" ? new Date(v) : null;
  return d && !isNaN(d.getTime()) ? d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : undefined;
};
export const accountPoints = (a: RewardAccount | null) => asNumber(pick(a, "points", "balance", "totalPoints", "total_points"));

/** Points badge for the header. */
export function PointsBadge({ points, signedIn, onClick }: { points: number | undefined; signedIn: boolean; onClick: () => void }) {
  if (!signedIn)
    return (
      <button className="points-badge" onClick={onClick} aria-label="Sign in for rewards">
        <Gift size={16} aria-hidden="true" /> Sign in
      </button>
    );
  return (
    <button className="points-badge" onClick={onClick} aria-label={`Rewards: ${points ?? "unknown"} points`}>
      <Gift size={16} aria-hidden="true" />
      <strong>{points ?? "–"}</strong> pts
    </button>
  );
}

export function RewardsView({ account, accountError, refreshAccount }: {
  account: RewardAccount | null;
  accountError: string;
  refreshAccount: () => Promise<void>;
}) {
  const [transactions, setTransactions] = useState<RewardTransaction[] | null>(null);
  const [txError, setTxError] = useState("");
  const [bins, setBins] = useState<DisposalBin[] | null>(null);
  const [binsError, setBinsError] = useState("");
  const [selected, setSelected] = useState("");
  const [session, setSession] = useState<DisposalSession | null>(null);
  const [sessionError, setSessionError] = useState("");
  const [starting, setStarting] = useState(false);
  const [polling, setPolling] = useState(false);
  const pollRef = useRef<{ stop: () => void } | null>(null);

  const loadTransactions = useCallback(async () => {
    try { const list = await rewardsApi.transactions(); setTransactions(list); setTxError(""); } catch (e) { setTxError((e as Error).message); }
  }, []);
  const loadBins = useCallback(async () => {
    try {
      const list = await rewardsApi.bins();
      setBins(list);
      setBinsError("");
      setSelected((s) => s || list[0]?.id || "");
    } catch (e) { setBinsError((e as Error).message); }
  }, []);

  useEffect(() => {
    void loadTransactions();
    void loadBins();
    return () => pollRef.current?.stop();
  }, [loadTransactions, loadBins]);

  function watch(id: string) {
    pollRef.current?.stop();
    const controller = new AbortController();
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = () => { controller.abort(); clearTimeout(timer); setPolling(false); };
    pollRef.current = { stop };
    setPolling(true);
    const tick = async () => {
      try {
        const s = await rewardsApi.session(id, controller.signal);
        if (controller.signal.aborted) return;
        setSession((old) => ({ ...old, ...s, id: (s.id as string) || id }));
        const status = asText(pick(s, "status", "state")) || "";
        if (DONE.test(status)) { stop(); await Promise.all([refreshAccount(), loadTransactions()]); return; }
        if (FAILED.test(status)) { stop(); return; }
      } catch (e) {
        if (controller.signal.aborted) return;
        setSessionError((e as Error).message);
        if (/not found|ended/i.test((e as Error).message)) { stop(); return; }
      }
      if (Date.now() - started > POLL_LIMIT_MS) { stop(); setSessionError("Stopped checking after 10 minutes. Tap “Check again” if you've deposited."); return; }
      timer = setTimeout(tick, POLL_MS);
    };
    timer = setTimeout(tick, 600);
  }

  async function start() {
    if (!selected || starting) return;
    setStarting(true);
    setSessionError("");
    setSession(null);
    try {
      const s = await rewardsApi.startDisposal(selected);
      const id = asText(pick(s, "id", "sessionId", "session_id"));
      setSession({ ...s, id });
      if (id) watch(id); else setSessionError("The backend started a session but did not return its ID.");
    } catch (e) { setSessionError((e as Error).message); }
    finally { setStarting(false); }
  }

  const points = accountPoints(account);
  const status = asText(pick(session, "status", "state")) || (session ? "waiting" : "");
  const done = DONE.test(status), failed = FAILED.test(status);
  const sessionPoints = asNumber(pick(session, "points", "pointsAwarded", "points_awarded", "awardedPoints"));
  const code = asText(pick(session, "code", "pin", "shortCode", "short_code"));
  const expires = when(pick(session, "expiresAt", "expires_at"));
  const instructions = asText(pick(session, "instructions", "message"));
  const binColor = (b?: DisposalBin) => BINS.find((x) => x.id === b?.category)?.color || "#94a3b8";

  return (
    <section className="rewards-page">
      <div className="rewards-grid">
        <article className="rewards-card points-card">
          <div className="eyebrow">YOUR POINTS</div>
          {accountError ? (
            <p className="error">{accountError}</p>
          ) : (
            <div className="points-big">
              {account ? (points ?? "–") : <LoaderCircle className="auth-spin" size={28} />}
              <span>points</span>
            </div>
          )}
          {account && asText(pick(account, "name", "displayName", "username", "email")) && (
            <p className="muted">{asText(pick(account, "name", "displayName", "username", "email"))}</p>
          )}
          <button className="text-link" onClick={() => void refreshAccount()}><RefreshCw size={15} /> Refresh</button>
        </article>

        <article className="rewards-card">
          <div className="eyebrow">EARN POINTS</div>
          <h3>Dispose at a smart bin</h3>
          <p className="muted">Pick a bin and start a disposal. The bin&apos;s camera station confirms your deposit, then points appear.</p>
          {binsError && <p className="error">{binsError} <button className="text-link" onClick={() => void loadBins()}>Retry</button></p>}
          {!bins && !binsError && <p className="muted"><LoaderCircle className="auth-spin" size={15} /> Loading bins…</p>}
          {bins && bins.length === 0 && <p className="muted">No bins are available right now.</p>}
          {bins && bins.length > 0 && (
            <div className="bin-choices" role="radiogroup" aria-label="Available bins">
              {bins.map((b) => (
                <button key={b.id} role="radio" aria-checked={selected === b.id} className={`bin-choice ${selected === b.id ? "selected" : ""}`} onClick={() => setSelected(b.id)} disabled={!!session && !done && !failed}>
                  <i style={{ background: binColor(b) }} />
                  <span><strong>{b.name || "Bin"}</strong>{b.category && <small>{BINS.find((x) => x.id === b.category)?.title || b.category}</small>}</span>
                </button>
              ))}
            </div>
          )}
          {(!session || done || failed) && (
            <button className="button dark start-disposal" onClick={() => void start()} disabled={!selected || starting}>
              {starting ? <LoaderCircle className="auth-spin" size={16} /> : <Trash2 size={16} />} Start disposal
            </button>
          )}
          {session && (
            <div className={`session-box ${done ? "done" : failed ? "failed" : "waiting"}`} role="status" aria-live="polite">
              <div className="session-status">
                {done ? <CheckCheck size={18} /> : failed ? <X size={18} /> : <LoaderCircle className="auth-spin" size={18} />}
                <strong>{done ? "Deposit confirmed" : failed ? `Session ${status}` : "Waiting for your deposit…"}</strong>
              </div>
              {code && <p>Code: <strong className="session-code">{code}</strong></p>}
              {instructions && <p>{instructions}</p>}
              {!done && !failed && <p className="muted">Put your item in the bin. The camera station will confirm it. Status: {status}</p>}
              {done && <p>{sessionPoints !== undefined ? `+${sessionPoints} points added.` : "Your points have been updated."}</p>}
              {expires && !done && <p className="muted"><Clock3 size={13} /> Expires {expires}</p>}
              {session.id && <p className="muted small">Session {session.id}</p>}
              {sessionError && <p className="error">{sessionError}</p>}
              {!done && !failed && session.id && !polling && (
                <button className="text-link" onClick={() => { setSessionError(""); watch(session.id as string); }}>Check again</button>
              )}
            </div>
          )}
          {!session && sessionError && <p className="error">{sessionError}</p>}
        </article>
      </div>

      <article className="rewards-card">
        <div className="section-heading">
          <h3>Reward history</h3>
          <button className="text-link" onClick={() => void loadTransactions()}><RefreshCw size={15} /> Refresh</button>
        </div>
        {txError && <p className="error">{txError}</p>}
        {!transactions && !txError && <p className="muted"><LoaderCircle className="auth-spin" size={15} /> Loading…</p>}
        {transactions && transactions.length === 0 && <p className="muted">No rewards yet. Start a disposal to earn your first points.</p>}
        {transactions && transactions.length > 0 && (
          <ul className="tx-list">
            {transactions.map((t, i) => {
              const pts = asNumber(pick(t, "points", "amount", "delta", "change"));
              const label = asText(pick(t, "description", "reason", "note", "type", "kind")) || "Reward";
              const date = when(pick(t, "createdAt", "created_at", "date", "timestamp", "time"));
              return (
                <li key={asText(pick(t, "id")) || i}>
                  <span><strong>{label}</strong>{date && <small>{date}</small>}</span>
                  {pts !== undefined && <b className={pts < 0 ? "neg" : "pos"}>{pts > 0 ? "+" : ""}{pts}</b>}
                </li>
              );
            })}
          </ul>
        )}
      </article>
    </section>
  );
}
