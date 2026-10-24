"use client";

// Bin station (DLC): a camera at the bin watches each item as it is deposited and says, live,
// whether it belongs in this bin. Uses the same on-device detector as the live scanner
// (public/live-detector.js, TensorFlow.js in the browser), so decisions take milliseconds.
// Bins come from the backend (GET /api/dlc/bins). Confirming deposits to the backend needs the
// station key, which stays with the backend owner, so this screen decides locally only.
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CheckCheck, LoaderCircle, Pause, Volume2, VolumeX, X } from "lucide-react";
import { BINS, rewardsApi, type DisposalBin } from "../lib/wastewise";
import { decide, type Detected, type Verdict } from "../lib/dlc-rules";

type Detector = { start(): void; stop(): void };

const HOLD_MS = 500; // item must be seen steadily this long before a decision
const RESET_MS = 2200; // then the station resets for the next item (as in the DLC engine)

export function DlcStation() {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const detector = useRef<Detector | null>(null);
  const latest = useRef<Detected[]>([]);
  const candidate = useRef<{ key: string; since: number } | null>(null);
  const lockedUntil = useRef(0);
  const decided = useRef(new Set<string>()); // items already judged; judged again only after leaving the view
  const audio = useRef<AudioContext | null>(null);
  const [bins, setBins] = useState<DisposalBin[] | null>(null);
  const [binsError, setBinsError] = useState("");
  const [binId, setBinId] = useState("");
  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [sound, setSound] = useState(true);
  const [counts, setCounts] = useState({ accept: 0, reject: 0 });

  const bin = bins?.find((b) => b.id === binId);
  const binInfo = BINS.find((b) => b.id === bin?.category);

  useEffect(() => {
    rewardsApi.bins().then((list) => { setBins(list); setBinId((id) => id || list[0]?.id || ""); }, (e) => setBinsError((e as Error).message));
  }, []);

  const beep = useCallback((ok: boolean) => {
    if (!sound) return;
    try {
      audio.current ??= new AudioContext();
      const ctx = audio.current, osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.frequency.value = ok ? 880 : 220;
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } catch { /* sound is optional */ }
  }, [sound]);

  const stop = useCallback(() => {
    detector.current?.stop();
    detector.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    latest.current = [];
    candidate.current = null;
    decided.current.clear();
    setRunning(false);
    setStarting(false);
    setVerdict(null);
  }, []);

  useEffect(() => {
    const hidden = () => { if (document.hidden) stop(); };
    document.addEventListener("visibilitychange", hidden);
    return () => { document.removeEventListener("visibilitychange", hidden); stop(); };
  }, [stop]);

  // Decision loop: an item must stay in view for HOLD_MS, then one verdict per item.
  useEffect(() => {
    if (!running || !bin?.category) return;
    const timer = setInterval(() => {
      const now = performance.now();
      if (now < lockedUntil.current) return;
      if (verdict && now >= lockedUntil.current) setVerdict(null);
      const visible = latest.current.filter((d) => !d.isNonWaste && (d.score ?? 0) >= 0.35);
      const visibleKeys = new Set(visible.map((d) => `${d.id ?? ""}:${d.label ?? ""}`));
      for (const k of decided.current) if (!visibleKeys.has(k)) decided.current.delete(k);
      const top = visible
        .filter((d) => !decided.current.has(`${d.id ?? ""}:${d.label ?? ""}`))
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
      if (!top) { candidate.current = null; return; }
      const key = `${top.id ?? ""}:${top.label ?? ""}`;
      if (candidate.current?.key !== key) { candidate.current = { key, since: now }; return; }
      if (now - candidate.current.since < HOLD_MS) return;
      const v = decide(bin.category as string, top);
      setVerdict(v);
      if (v.kind !== "check") { const k = v.kind; setCounts((c) => ({ ...c, [k]: c[k] + 1 })); beep(k === "accept"); }
      decided.current.add(key);
      lockedUntil.current = now + RESET_MS;
      candidate.current = null;
    }, 100);
    return () => clearInterval(timer);
  }, [running, bin?.category, beep, verdict]);

  async function start() {
    if (!bin) return;
    stop();
    setStarting(true);
    setError("");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera access needs HTTPS or localhost and a browser with camera support.");
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 } }, audio: false });
      stream.current = media;
      const v = video.current!;
      v.srcObject = media;
      await v.play();
      setRunning(true);
      setStarting(false);
      setStatus("Loading on-device detector…");
      const url = `${window.location.origin}/live-detector.js`;
      const mod = (await import(/* @vite-ignore */ url)) as { LiveARDetector: new (o: object) => Detector };
      if (!stream.current) return;
      const d = new mod.LiveARDetector({
        video: v,
        canvas: canvas.current,
        onStatus: (text: string) => setStatus(text),
        onDetect: (list: Detected[]) => { latest.current = list || []; },
      });
      detector.current = d;
      d.start();
    } catch (e) {
      const name = (e as Error).name;
      setError(name === "NotAllowedError" ? "Camera permission was denied. Allow camera access, then try again." : name === "NotFoundError" ? "No camera was found." : (e as Error).message);
      stop();
    }
  }

  return (
    <div className="dlc-station">
      <p className="muted">
        Set this device up at a bin. Hold each item in front of the camera before dropping it in, and the station tells you instantly whether it belongs here.
      </p>
      {binsError && <p className="error">{binsError}</p>}
      {!bins && !binsError && <p className="muted"><LoaderCircle className="spin" size={15} /> Loading bins…</p>}
      {bins && bins.length === 0 && <p className="muted">The backend has no bins set up yet.</p>}
      {bins && bins.length > 0 && (
        <label className="dlc-bin-select">
          This station is at
          <select value={binId} onChange={(e) => { setBinId(e.target.value); setCounts({ accept: 0, reject: 0 }); }} disabled={running}>
            {bins.map((b) => (
              <option key={b.id} value={b.id}>{b.name || "Bin"}{b.category ? ` · ${BINS.find((x) => x.id === b.category)?.title || b.category}` : ""}</option>
            ))}
          </select>
        </label>
      )}
      <div className={`camera-stage dlc-stage ${verdict ? `verdict-${verdict.kind}` : ""}`} style={{ aspectRatio: 4 / 3, ["--bin" as string]: binInfo?.color || "#94a3b8" }}>
        <video ref={video} playsInline muted />
        <canvas ref={canvas} />
        {!running && (
          <div className="camera-placeholder">
            <Camera size={44} />
            <h3>Bin station</h3>
            <p>{binInfo ? `Accepting ${binInfo.title.toLowerCase()} · ${binInfo.destination}` : "Choose a bin to start."}</p>
          </div>
        )}
        {running && binInfo && <span className="dlc-accepting"><i style={{ background: binInfo.color }} /> Accepting {binInfo.title.toLowerCase()}</span>}
        {verdict && (
          <div className={`dlc-verdict ${verdict.kind}`} role="status" aria-live="assertive">
            {verdict.kind === "accept" ? <CheckCheck size={34} /> : verdict.kind === "reject" ? <X size={34} /> : <LoaderCircle size={30} />}
            <strong>{verdict.kind === "accept" ? "Accepted" : verdict.kind === "reject" ? "Wrong bin" : "Check item"}</strong>
            <span>{verdict.item}</span>
            <small>{verdict.message}</small>
          </div>
        )}
      </div>
      <div className="dlc-controls">
        <button className="button dark full" disabled={starting || !bin} onClick={running ? stop : start}>
          {starting ? <LoaderCircle className="spin" size={18} /> : running ? <Pause size={18} /> : <Camera size={18} />} {starting ? "Opening camera…" : running ? "Stop station" : "Start station"}
        </button>
        <button className="icon-button" onClick={() => setSound((s) => !s)} aria-label={sound ? "Mute beeps" : "Turn beeps on"}>
          {sound ? <Volume2 size={19} /> : <VolumeX size={19} />}
        </button>
      </div>
      {running && <p className="detector-status">{status}</p>}
      {(counts.accept > 0 || counts.reject > 0) && (
        <p className="dlc-counts"><span className="ok">✓ {counts.accept} accepted</span><span className="no">✕ {counts.reject} redirected</span></p>
      )}
      {error && <p className="error">{error}</p>}
      <p className="privacy-note">Detection runs on this device; camera images are not uploaded. Deposits are not reported to the backend from this screen.</p>
    </div>
  );
}
