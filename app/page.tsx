"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Battery,
  BookOpen,
  Camera,
  Check,
  CheckCheck,
  ChevronRight,
  CircleHelp,
  Clock3,
  Gift,
  Home,
  ImagePlus,
  Leaf,
  LoaderCircle,
  Pause,
  Play,
  Plus,
  Recycle,
  ScanLine,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  Wifi,
  X,
} from "lucide-react";
import {
  api,
  BINS,
  binForRule,
  resultFromItem,
  safeColor,
  type Analysis,
  type Bin,
  type CatalogItem,
  type Classification,
  type Rule,
  rewardsApi,
  type RewardAccount,
} from "../lib/wastewise";
import { PointsBadge, RewardsView, accountPoints } from "../components/rewards-view";
import { RequireSignIn, useAuth } from "../components/auth-gate";
import { DlcStation } from "../components/dlc-station";
import { AccountHistoryView } from "../components/account-history-view";
import {
  historySnapshot,
  retryPending,
  saveHistory,
  useAccountHistory,
  type HistoryEntry,
  type HistorySource,
  type HistoryState,
} from "../lib/account-history";

type View = "home" | "guide" | "history" | "rewards";
type Modal = "photo" | "camera" | "help" | "dlc" | null;

function BinArt({
  color = "#202320",
  small = false,
}: {
  color?: string;
  small?: boolean;
}) {
  return (
    <svg
      className={small ? "bin-art small" : "bin-art"}
      viewBox="0 0 180 220"
      fill="none"
      aria-hidden="true"
    >
      <ellipse cx="92" cy="205" rx="56" ry="9" fill="#151814" opacity=".12" />
      <path d="M42 61h100l-10 127c-1 10-79 10-80 0L42 61Z" fill={color} />
      <path
        d="M42 61h100l-10 127c-1 10-79 10-80 0L42 61Z"
        fill="url(#bin-shade)"
      />
      <path d="M35 54c0-5 3-9 9-9h98c6 0 10 4 10 9v13H35V54Z" fill={color} />
      <path d="M74 46v-9c0-9 37-9 37 0v9" stroke={color} strokeWidth="9" />
      <path
        d="m67 87 3 87m48-87-3 87"
        stroke="white"
        strokeOpacity=".14"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <circle cx="69" cy="195" r="9" fill="#1b201b" />
      <circle cx="120" cy="195" r="9" fill="#1b201b" />
      <path
        d="m88 110 8-13 10 17m-3-1 5 1 1-6m3 19 8 13H99m2-3-3 4 4 4m-14-3H73l10-17m2 4-1-6-6 1"
        stroke="white"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <defs>
        <linearGradient
          id="bin-shade"
          x1="42"
          y1="60"
          x2="150"
          y2="190"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="white" stopOpacity=".2" />
          <stop offset=".5" stopColor="white" stopOpacity="0" />
          <stop offset="1" stopColor="black" stopOpacity=".23" />
        </linearGradient>
      </defs>
    </svg>
  );
}
function Orb({ small = false }: { small?: boolean }) {
  return (
    <div className={`orb ${small ? "orb-small" : ""}`} aria-hidden="true">
      {[0, 1, 2, 3, 4, 5].map((n) => (
        <i key={n} style={{ "--n": n } as CSSProperties} />
      ))}
      <Sparkles />
    </div>
  );
}
function ErrorMessage({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <div className="error" role="alert">
      <CircleHelp size={19} />
      <div>
        {message}
        {retry && (
          <button className="text-link" onClick={retry}>
            Try again <ArrowRight size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
type AutoSave = { source: HistorySource; scanId?: string; delayMs?: number };
function historyEntryFrom(r: Classification, o: { id: string; source: HistorySource; scanId?: string; condition?: string | null }): HistoryEntry {
  const quantity = Number.isInteger(r.quantity) ? Math.min(100, Math.max(1, r.quantity as number)) : 1;
  return {
    id: o.id,
    item: String(r.item || r.query || "Item").slice(0, 160),
    source: o.source,
    quantity,
    material: r.material || undefined,
    category: r.category || undefined,
    bin: r.bin || undefined,
    ruleId: r.rule?.id,
    guideVersion: "1.0",
    preparation: r.tip || undefined,
    quotation: r.rule?.text,
    condition: o.condition || undefined,
    scanId: o.scanId,
  };
}
function ResultCard({
  result,
  rules,
  autoSave,
}: {
  result: Classification;
  rules: Rule[];
  autoSave?: AutoSave;
}) {
  const [condition, setCondition] = useState<"clean" | "greasy" | null>(null);
  // One stable history ID per result card: retries, live updates and corrections reuse it.
  const [entryId] = useState(() => crypto.randomUUID());
  const history = useAccountHistory();
  // Only save for the account that was signed in when this result appeared.
  const [ownerUid] = useState(() => historySnapshot().uid);
  const isPizza = /pizza box/i.test(result.item || "");
  const selectedBin = condition ? BINS[condition === "clean" ? 1 : 2] : null;
  const rule = condition
    ? rules.find((r) => r.id === (condition === "clean" ? "R2" : "R7"))
    : result.rule;
  const entry =
    autoSave && result.recognized && ownerUid
      ? historyEntryFrom(selectedBin ? { ...result, category: selectedBin.title, bin: selectedBin.destination, rule } : result, {
          id: entryId,
          source: autoSave.source,
          scanId: autoSave.scanId,
          condition,
        })
      : null;
  const signature = entry ? JSON.stringify(entry) : "";
  const lastSaved = useRef("");
  const delay = autoSave?.delayMs ?? 0;
  useEffect(() => {
    if (!signature || history.uid !== ownerUid || lastSaved.current === signature) return;
    const t = setTimeout(() => {
      lastSaved.current = signature;
      void saveHistory([JSON.parse(signature) as HistoryEntry]);
    }, delay);
    return () => clearTimeout(t);
  }, [signature, history.uid, ownerUid, delay]);
  const adjusted = selectedBin
    ? {
        ...result,
        category: selectedBin.title,
        bin: selectedBin.destination,
        dustbin: `${selectedBin.title} · ${selectedBin.destination}`,
        color: selectedBin.color,
        rule,
      }
    : result;
  return (
    <article
      className="result-card"
      style={{ "--bin": safeColor(adjusted.color) } as CSSProperties}
    >
      <div className="result-top">
        <span className="result-icon">
          <Recycle size={23} />
        </span>
        <div>
          <span className="eyebrow">
            {result.recognized ? "SORTING RESULT" : "LET’S CHECK THAT"}
          </span>
          <h3>{result.item || result.query || "Unrecognized item"}</h3>
        </div>
        {result.quantity ? (
          <span className="quantity">×{result.quantity}</span>
        ) : null}
      </div>
      <span className="bin-label">
        <i />
        {adjusted.dustbin || adjusted.bin || "No verified bin returned"}
      </span>
      {result.certain === false && (
        <p className="uncertainty">
          Detection is uncertain. Check the item before disposing.
        </p>
      )}
      {result.material && <p>Material: {result.material}</p>}
      {isPizza && (
        <div className="condition">
          <p>What condition is your pizza box in?</p>
          <div>
            <button
              className={condition === "clean" ? "selected" : ""}
              onClick={() => setCondition("clean")}
            >
              Clean & dry
            </button>
            <button
              className={condition === "greasy" ? "selected" : ""}
              onClick={() => setCondition("greasy")}
            >
              Greasy / food-soiled
            </button>
          </div>
        </div>
      )}
      {rule ? (
        <blockquote>
          <span>
            <BookOpen size={14} /> Rule {rule.id} · {rule.title}
          </span>
          “{rule.text}”
        </blockquote>
      ) : (
        <p className="muted">
          No supporting rule was returned. Check the campus guide or ask the AI
          assistant.
        </p>
      )}
      {adjusted.tip && (
        <p className="tip">
          <Sparkles size={15} />
          {adjusted.tip}
        </p>
      )}
      {autoSave && result.recognized && (
        <SaveStatus entryId={entryId} ownerUid={ownerUid} history={history} />
      )}
    </article>
  );
}
function SaveStatus({ entryId, ownerUid, history }: { entryId: string; ownerUid: string | null; history: HistoryState }) {
  if (!ownerUid) return <p className="save-status muted">Sign in to save results to your history automatically.</p>;
  if (history.uid !== ownerUid) return null; // a different account is signed in now
  const pending = history.pending[entryId];
  if (pending?.status === "saving") return <p className="save-status"><LoaderCircle className="spin" size={14} /> Saving to your history…</p>;
  if (pending?.status === "failed")
    return (
      <p className="save-status failed">
        Not saved: {pending.error}{" "}
        <button className="text-link" onClick={() => void retryPending([entryId])}>Retry</button>
      </p>
    );
  if (history.entries.some((e) => e.id === entryId))
    return <p className="save-status ok"><Check size={14} /> Saved to your history</p>;
  return null;
}
function ModalShell({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = old;
      d?.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="modal-inner">
        <div className="modal-head">
          <div>
            <span className="eyebrow">WASTEWISE STUDIO</span>
            <h2>{title}</h2>
          </div>
          <button
            aria-label="Close dialog"
            className="icon-button"
            onClick={close}
          >
            <X />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
function PhotoPanel({ rules }: { rules: Rule[] }) {
  const [photo, setPhoto] = useState<{
    data: string;
    mime: string;
    name: string;
  } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const photoScanId = useMemo(() => (analysis ? crypto.randomUUID() : ""), [analysis]);
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
      controller.current?.abort();
    },
    [],
  );
  async function select(file?: File) {
    if (!file) return;
    generation.current++;
    const token = generation.current;
    controller.current?.abort();
    setBusy(false);
    setError("");
    setAnalysis(null);
    setPhoto(null);
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Choose a JPG, PNG, or WEBP image.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("Choose an image smaller than 8 MB.");
      return;
    }
    try {
      const img = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      const ratio = Math.min(1, 1600 / Math.max(img.width, img.height));
      canvas.width = Math.round(img.width * ratio);
      canvas.height = Math.round(img.height * ratio);
      canvas
        .getContext("2d")!
        .drawImage(img, 0, 0, canvas.width, canvas.height);
      img.close();
      if (token === generation.current)
        setPhoto({
          data: canvas.toDataURL("image/jpeg", 0.85),
          mime: "image/jpeg",
          name: file.name,
        });
    } catch {
      if (token === generation.current)
        setError("This image could not be opened. Please choose another file.");
    }
  }
  async function analyze() {
    if (!photo) return;
    controller.current?.abort();
    const c = new AbortController();
    controller.current = c;
    setBusy(true);
    setError("");
    setAnalysis(null);
    try {
      setAnalysis(
        await api.analyze(
          {
            mode: "photo",
            photo: { data: photo.data, mime: photo.mime },
            description: note,
          },
          c.signal,
        ),
      );
    } catch (e) {
      if (!c.signal.aborted) setError((e as Error).message);
    } finally {
      if (!c.signal.aborted) setBusy(false);
    }
  }
  return (
    <>
      <p className="muted">
        One item or a mixed pile. We’ll look for the right bin and its
        supporting campus rule.
      </p>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        aria-label="Choose waste photo"
        onChange={(e) => {
          select(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <button
        className={`dropzone ${drag ? "dragging" : ""}`}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          select(e.dataTransfer.files[0]);
        }}
      >
        {photo ? (
          <>
            <img src={photo.data} alt="Selected waste to analyze" />
            <span>{photo.name} · Click to replace</span>
          </>
        ) : (
          <>
            <span className="round-icon">
              <ImagePlus size={30} />
            </span>
            <strong>Drop a photo here</strong>
            <span>or click to browse · JPG, PNG, WEBP · up to 8 MB</span>
          </>
        )}
      </button>
      <label className="field-label" htmlFor="photo-note">
        Anything we should know? <span>(optional)</span>
      </label>
      <input
        id="photo-note"
        className="field"
        maxLength={1000}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="e.g. The cardboard has food stains"
      />
      <button
        className="button dark full"
        disabled={!photo || busy}
        onClick={analyze}
      >
        {busy ? (
          <LoaderCircle className="spin" size={18} />
        ) : (
          <Sparkles size={18} />
        )}{" "}
        {busy ? "Analyzing your photo…" : "Find the right bin"}
        <ArrowUpRight size={18} />
      </button>
      {error && (
        <ErrorMessage
          message={error}
          retry={photo ? analyze : () => fileRef.current?.click()}
        />
      )}
      <AnalysisResults analysis={analysis} rules={rules} source="photo" scanId={photoScanId} />
      <p className="privacy-note">
        <ShieldCheck size={14} />
        Photos are sent to the configured backend for analysis. Only the text
        results are saved to your history, never the photo.
      </p>
    </>
  );
}
function AnalysisResults({
  analysis,
  rules,
  source,
  scanId,
}: {
  analysis: Analysis | null;
  rules: Rule[];
  source: HistorySource;
  scanId: string;
}) {
  if (!analysis) return null;
  // Stable key per item group within one scan, so live updates upsert the same history entry.
  const seen = new Map<string, number>();
  const groupKey = (item: Analysis["items"][number]) => {
    const name = String(item.item || item.label || "item").toLowerCase();
    const n = (seen.get(name) || 0) + 1;
    seen.set(name, n);
    return `${scanId}:${name}:${n}`;
  };
  return (
    <div className="analysis-results">
      <p>
        {analysis.overview ||
          `${analysis.items.length} item(s) returned by the backend.`}
      </p>
      {analysis.incomplete && (
        <p className="uncertainty">
          Analysis is incomplete. Try another angle.
        </p>
      )}
      {analysis.items.length === 0 && (
        <p className="muted">
          No items detected. Try a clearer image or describe the item.
        </p>
      )}
      {analysis.items.map((item, i) => (
        <ResultCard
          key={groupKey(item) || i}
          result={resultFromItem(item, rules)}
          rules={rules}
          autoSave={{ source, scanId, delayMs: source === "live" ? 1500 : 0 }}
        />
      ))}
    </div>
  );
}
function CameraPanel({ rules }: { rules: Rule[] }) {
  // One scan ID per camera session: item groups keep their history entry across frames.
  const [liveScanId, setLiveScanId] = useState("");
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controller = useRef<AbortController | null>(null);
  const active = useRef(false);
  const session = useRef(0);
  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [aspect, setAspect] = useState(4 / 3);
  const [busy, setBusy] = useState(false);
  const failures = useRef(0);
  const lastSent = useRef(0);
  // On-device detector (TensorFlow.js, runs in the browser): draws and tracks boxes on every
  // video frame within milliseconds. Gemini results from the backend refine it as they arrive.
  const detector = useRef<LiveDetector | null>(null);
  const [detectorStatus, setDetectorStatus] = useState("");
  const stop = useCallback(() => {
    active.current = false;
    detector.current?.stop();
    detector.current = null;
    session.current++;
    if (timer.current) clearTimeout(timer.current);
    controller.current?.abort();
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    setRunning(false);
    setStarting(false);
    setBusy(false);
    const c = canvas.current;
    c?.getContext("2d")?.clearRect(0, 0, c.width, c.height);
  }, []);
  useEffect(() => {
    const hidden = () => {
      if (document.hidden) stop();
    };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      stop();
    };
  }, [stop]);
  async function capture(token: number) {
    const v = video.current;
    if (!active.current || token !== session.current || !v) return;
    if (!v.videoWidth) {
      timer.current = setTimeout(() => capture(token), 300);
      return;
    }
    // Remember where the camera was when this frame was taken, so the detector can move
    // Gemini's (slower) boxes to where each object is now.
    const reference = detector.current?.reference();
    const frame = document.createElement("canvas");
    const ratio = Math.min(1, 640 / v.videoWidth); // smaller frames upload and analyse faster
    frame.width = Math.round(v.videoWidth * ratio);
    frame.height = Math.round(v.videoHeight * ratio);
    frame.getContext("2d")!.drawImage(v, 0, 0, frame.width, frame.height);
    const c = new AbortController();
    controller.current = c;
    lastSent.current = performance.now();
    setBusy(true);
    try {
      const res = await api.analyze(
        {
          mode: "live-frame",
          photo: {
            data: frame.toDataURL("image/jpeg", 0.7),
            mime: "image/jpeg",
          },
          observations: [],
        },
        c.signal,
      );
      if (!active.current || token !== session.current) return;
      failures.current = 0;
      setError("");
      setAnalysis(res);
      if (detector.current) {
        // Hand Gemini's boxes to the live tracker; it keeps drawing every frame.
        detector.current.addAssistedTags(res.tagObjects || [], reference);
      }
      const overlay = detector.current ? null : canvas.current;
      if (overlay) {
        overlay.width = v.videoWidth;
        overlay.height = v.videoHeight;
        const ctx = overlay.getContext("2d")!;
        ctx.clearRect(0, 0, overlay.width, overlay.height);
        for (const tag of res.tagObjects || []) {
          if (
            !Array.isArray(tag.box_2d) ||
            tag.box_2d.length !== 4 ||
            !tag.box_2d.every(Number.isFinite)
          )
            continue;
          const [y1, x1, y2, x2] = tag.box_2d.map((n) =>
            Math.max(0, Math.min(1000, n)),
          );
          if (x2 <= x1 || y2 <= y1) continue;
          // The backend sends item: null for objects it can't identify yet.
          const type = String(tag.type ?? "").toLowerCase();
          const item = res.items.find(
            (i) =>
              (typeof i.item === "string" && i.item.toLowerCase() === type) ||
              (typeof i.label === "string" && i.label.toLowerCase() === type),
          );
          const bin = binForRule(item?.ruleId);
          const x = (x1 / 1000) * overlay.width,
            y = (y1 / 1000) * overlay.height,
            w = ((x2 - x1) / 1000) * overlay.width,
            h = ((y2 - y1) / 1000) * overlay.height;
          const scale = Math.max(1, overlay.width / 640);
          ctx.strokeStyle = bin?.color || "#94a3b8";
          ctx.lineWidth = 3 * scale;
          ctx.strokeRect(x, y, w, h);
          ctx.font = `600 ${14 * scale}px sans-serif`;
          const text = `${tag.type || "Object"}${tag.certain === false ? " ?" : ""} · ${bin?.destination || "Needs review"}`;
          const labelW = Math.min(
            overlay.width,
            ctx.measureText(text).width + 18 * scale,
          );
          const labelX = Math.max(0, Math.min(x, overlay.width - labelW));
          const labelY = Math.max(0, y - 32 * scale);
          ctx.fillStyle = "#171b19";
          ctx.fillRect(labelX, labelY, labelW, 30 * scale);
          ctx.fillStyle = bin?.color || "#fff";
          ctx.fillText(
            text,
            labelX + 9 * scale,
            labelY + 20 * scale,
            labelW - 18 * scale,
          );
        }
      }
    } catch (e) {
      if (c.signal.aborted) return;
      const message = (e as Error).message;
      if (/HTTP 429|too many/i.test(message)) {
        // Backend rate limit: not an error. Keep the camera and on-device boxes live, wait, retry.
        setError("");
        if (active.current && token === session.current)
          timer.current = setTimeout(() => capture(token), 12_000);
        return;
      }
      failures.current++;
      // Stop on errors that won't fix themselves (no AI credit, not signed in) or repeated failures;
      // otherwise keep the camera live and try the next frame.
      if (/allowance|exhausted|quota|sign in/i.test(message) || failures.current >= 3) {
        setError(failures.current >= 3 ? `${message} (stopped after 3 failed frames)` : message);
        stop();
        return;
      }
      setError(`${message} Retrying…`);
    } finally {
      if (!c.signal.aborted) setBusy(false);
    }
    // One request at a time, started at most every 5 s: the backend allows about 12 analyses
    // a minute. The on-device detector keeps boxes moving live in between.
    if (active.current && token === session.current)
      timer.current = setTimeout(
        () => capture(token),
        Math.max(250, 5_000 - (performance.now() - lastSent.current)),
      );
  }
  async function startDetector(token: number, v: HTMLVideoElement) {
    const overlay = canvas.current;
    if (!overlay) return;
    try {
      setDetectorStatus("Loading on-device detector…");
      // Full URL so the dev server doesn't rewrite it (it appends "?import" to "/…" paths).
      const url = `${window.location.origin}/live-detector.js`; // served from public/
      const mod = (await import(/* @vite-ignore */ url)) as { LiveARDetector: new (o: object) => LiveDetector };
      if (!active.current || token !== session.current) return;
      const d = new mod.LiveARDetector({ video: v, canvas: overlay, onStatus: (text: string) => setDetectorStatus(text) });
      detector.current = d;
      d.start();
    } catch (e) {
      setDetectorStatus(`On-device detector unavailable (${(e as Error).message}). Showing backend boxes only.`);
    }
  }
  async function start() {
    stop();
    failures.current = 0;
    setLiveScanId(crypto.randomUUID());
    const token = session.current;
    setStarting(true);
    setError("");
    setAnalysis(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error(
          "Camera access needs HTTPS or localhost and a browser with camera support.",
        );
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 } },
        audio: false,
      });
      if (token !== session.current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = media;
      const v = video.current!;
      v.srcObject = media;
      await v.play();
      if (token !== session.current) return;
      setAspect(v.videoWidth / v.videoHeight || 4 / 3);
      active.current = true;
      setRunning(true);
      setStarting(false);
      capture(token);
      void startDetector(token, v);
    } catch (e) {
      if (token !== session.current) return;
      const name = (e as Error).name;
      setError(
        name === "NotAllowedError"
          ? "Camera permission was denied. Allow camera access in your browser, then try again."
          : name === "NotFoundError"
            ? "No camera was found. You can upload a photo instead."
            : (e as Error).message,
      );
      stop();
    }
  }
  return (
    <>
      <p className="muted">
        Point at an item. Boxes appear instantly from the on-device detector;
        the backend AI confirms each item and its bin a few seconds later.
      </p>
      <div className="camera-stage" style={{ aspectRatio: aspect }}>
        <video ref={video} playsInline muted />
        <canvas ref={canvas} />
        {!running && (
          <div className="camera-placeholder">
            <ScanLine size={48} />
            <h3>Your next good habit starts here.</h3>
            <p>Start your camera to identify waste.</p>
          </div>
        )}
        {running && (
          <span className="live-badge">
            <i />
            {busy ? "Live · AI checking…" : "Camera live"}
          </span>
        )}
      </div>
      <button
        className="button dark full"
        disabled={starting}
        onClick={running ? stop : start}
      >
        {starting ? (
          <LoaderCircle className="spin" size={18} />
        ) : running ? (
          <Pause size={18} />
        ) : (
          <Camera size={18} />
        )}{" "}
        {starting
          ? "Opening camera…"
          : running
            ? "Stop camera"
            : "Start camera"}
      </button>
      {running && detectorStatus && <p className="detector-status">{detectorStatus}</p>}
      {error && <ErrorMessage message={error} />}
      <AnalysisResults analysis={analysis} rules={rules} source="live" scanId={liveScanId} />
      <p className="privacy-note">
        <ShieldCheck size={14} />
        Camera stops when you close this window or switch tabs. Audio is never
        requested.
      </p>
    </>
  );
}

type LiveDetector = {
  start(): void;
  stop(): void;
  reference(): unknown;
  addAssistedTags(objects: unknown[], reference: unknown): void;
};

export default function Page() {
  const [view, setView] = useState<View>("home");
  const [modal, setModal] = useState<Modal>(null);
  const [navHidden, setNavHidden] = useState(false);
  const [rules, setRules] = useState<Rule[]>([]);
  const [campus, setCampus] = useState("Campus guide");
  const [status, setStatus] = useState<"loading" | "online" | "offline">(
    "loading",
  );
  const [configReady, setConfigReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<Classification | null>(null);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchRetry, setSearchRetry] = useState(0);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [catalogTotal, setCatalogTotal] = useState<number | null>(null);
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogBusy, setCatalogBusy] = useState(false);
  const [catalogError, setCatalogError] = useState("");
  const [catalogRetry, setCatalogRetry] = useState(0);
  const [filter, setFilter] = useState("all");
  const [visibleCount, setVisibleCount] = useState(12);
  const [assistant, setAssistant] = useState("");
  const [assistantBusy, setAssistantBusy] = useState(false);
  const [assistantError, setAssistantError] = useState("");
  const [assistantResult, setAssistantResult] = useState<Analysis | null>(null);
  const assistantScanId = useMemo(() => (assistantResult ? crypto.randomUUID() : ""), [assistantResult]);
  const assistantController = useRef<AbortController | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  async function loadBasics() {
    setLoadError("");
    setStatus("loading");
    const [config, guide] = await Promise.allSettled([
      api.config(),
      api.rules(),
    ]);
    if (config.status === "fulfilled") {
      setStatus("online");
      setConfigReady(config.value.configured);
    } else {
      setStatus("offline");
      setLoadError(config.reason.message);
    }
    if (guide.status === "fulfilled" && Array.isArray(guide.value.rules)) {
      setRules(guide.value.rules);
      setCampus(guide.value.campus);
    } else setLoadError("Campus rules could not be loaded. Please retry.");
  }
  useEffect(() => {
    loadBasics();
    return () => assistantController.current?.abort();
  }, []);
  useEffect(() => {
    let last = window.scrollY;
    let amount = 0;
    let direction = 0;
    const onScroll = () => {
      const y = Math.max(0, window.scrollY),
        delta = y - last;
      last = y;
      if (y < 40) {
        setNavHidden(false);
        return;
      }
      const nextDirection = Math.sign(delta);
      if (nextDirection !== direction) {
        amount = 0;
        direction = nextDirection;
      }
      amount += Math.abs(delta);
      if (amount > 12) {
        setNavHidden(delta > 0);
        amount = 0;
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    const text = query.trim();
    setResult(null);
    setSearchError("");
    setSearchBusy(!!text);
    if (!text) return;
    const c = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const value = await api.classify(text, c.signal);
        if (!c.signal.aborted) setResult(value);
      } catch (e) {
        if (!c.signal.aborted) setSearchError((e as Error).message);
      } finally {
        if (!c.signal.aborted) setSearchBusy(false);
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      c.abort();
    };
  }, [query, searchRetry]);
  useEffect(() => {
    const c = new AbortController();
    setCatalogBusy(true);
    setCatalogError("");
    const timer = setTimeout(async () => {
      try {
        const data = await api.catalog(catalogQuery, c.signal);
        if (!Array.isArray(data.items))
          throw new Error("The backend returned an invalid catalog.");
        if (!c.signal.aborted) {
          setCatalog(data.items);
          if (!catalogQuery) setCatalogTotal(data.total);
          setVisibleCount(12);
        }
      } catch (e) {
        if (!c.signal.aborted) setCatalogError((e as Error).message);
      } finally {
        if (!c.signal.aborted) setCatalogBusy(false);
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      c.abort();
    };
  }, [catalogQuery, catalogRetry]);
  const [rewardAccount, setRewardAccount] = useState<RewardAccount | null>(null);
  const [rewardError, setRewardError] = useState("");
  // Rewards belong to one account: cleared at once on logout/switch; late answers are ignored.
  const authState = useAuth();
  const signedInUid = authState.status === "signedIn" ? authState.user.uid : null;
  const rewardOwner = useRef<string | null>(null);
  const loadRewards = useCallback(async () => {
    const uid = rewardOwner.current;
    if (!uid) return;
    try {
      const account = await rewardsApi.me();
      if (rewardOwner.current !== uid) return;
      setRewardAccount(account);
      setRewardError("");
    } catch (e) {
      if (rewardOwner.current !== uid) return;
      setRewardError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    rewardOwner.current = signedInUid;
    setRewardAccount(null);
    setRewardError("");
    if (signedInUid) void loadRewards();
  }, [signedInUid, loadRewards]);
  function navigate(next: View) {
    setView(next);
    setNavHidden(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function choose(text: string) {
    setQuery(text);
    setView("home");
    requestAnimationFrame(() => {
      searchRef.current?.focus();
      document
        .getElementById("sort-search")
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }
  async function ask(text = assistant) {
    if (!text.trim() || assistantBusy) return;
    setAssistant(text);
    assistantController.current?.abort();
    const c = new AbortController();
    assistantController.current = c;
    setAssistantBusy(true);
    setAssistantError("");
    setAssistantResult(null);
    try {
      setAssistantResult(
        await api.analyze({ description: text.trim() }, c.signal),
      );
    } catch (e) {
      if (!c.signal.aborted) setAssistantError((e as Error).message);
    } finally {
      if (!c.signal.aborted) setAssistantBusy(false);
    }
  }
  const filtered = catalog.filter(
    (item) => filter === "all" || binForRule(item.ruleId)?.id === filter,
  );
  return (
    <div className="app-shell">
      <header className="topbar">
        <button
          className="brand"
          onClick={() => navigate("home")}
          aria-label="WasteWise home"
        >
          <span className="brand-symbol">
            <Recycle size={25} />
          </span>
          Waste<span>Wise</span>
          <span className="brand-dot">®</span>
        </button>
        <div className="header-center">
          <span className="campus-dot" />
          {campus}
          <span className="header-divider" />
          Small steps. Better planet.
        </div>
        <div className="header-right">
          <span
            className={`connection ${status}`}
            title={
              configReady
                ? "Backend reachable; AI provider status is checked on each request."
                : "Backend connection status"
            }
          >
            <i />
            {status === "online"
              ? "Backend connected"
              : status === "loading"
                ? "Connecting…"
                : "Backend offline"}
          </span>
          <PointsBadge
            points={signedInUid ? accountPoints(rewardAccount) : undefined}
            signedIn={!!signedInUid}
            onClick={() => navigate("rewards")}
          />
          <button
            className="icon-button help-button"
            onClick={() => setModal("help")}
            aria-label="About WasteWise"
          >
            <CircleHelp size={21} />
          </button>
          <button
            className="avatar"
            onClick={() => setModal("dlc")}
            aria-label="Open the bin station"
            title="Bin station"
          >
            <Trash2 size={21} />
          </button>
        </div>
      </header>
      <main>
        <div className="page-heading">
          <div>
            <div className="eyebrow">
              <span className="tiny-star">✳</span> A SMALL ACT. A BIG
              DIFFERENCE.
            </div>
            <h1>
              {view === "home" ? (
                <>
                  A little wiser. <span>A lot greener.</span>
                </>
              ) : view === "guide" ? (
                <>
                  Every item. <span>A better place.</span>
                </>
              ) : view === "rewards" ? (
                <>
                  Sort right. <span>Get rewarded.</span>
                </>
              ) : (
                <>
                  Good habits. <span>Worth keeping.</span>
                </>
              )}
            </h1>
            <p>
              {view === "home"
                ? "Not sure where it goes? Let’s sort it out, together."
                : view === "guide"
                  ? "Your campus rules, straight from the source."
                  : view === "rewards"
                    ? "Earn points every time a smart bin confirms your deposit."
                  : "Your saved sorting results, stored only in this browser."}
            </p>
          </div>
          <div className="date-badge">
            <span className="date-icon">
              <Leaf size={22} />
            </span>
            <span>
              MAKE ROOM FOR
              <br />
              <strong>a greener tomorrow</strong>
            </span>
          </div>
        </div>
        {loadError && <ErrorMessage message={loadError} retry={loadBasics} />}
        {view === "home" && (
          <>
            <div className="dashboard-grid">
              <section className="main-column">
                <div className="search-area" id="sort-search">
                  <div className="search-box">
                    <Search size={22} />
                    <input
                      ref={searchRef}
                      aria-label="Search an item to sort"
                      value={query}
                      maxLength={1000}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="What are you throwing away?"
                    />
                    {searchBusy ? (
                      <LoaderCircle className="spin" size={20} />
                    ) : query ? (
                      <button
                        aria-label="Clear search"
                        onClick={() => setQuery("")}
                      >
                        <X size={18} />
                      </button>
                    ) : (
                      <span className="search-hint">
                        Find its bin <ArrowUpRight size={16} />
                      </span>
                    )}
                  </div>
                  <div className="try-row">
                    <span>Try it:</span>
                    {["Banana peel", "Plastic bottle", "Pizza box"].map((s) => (
                      <button key={s} onClick={() => choose(s)}>
                        {s}
                        <ArrowUpRight size={12} />
                      </button>
                    ))}
                  </div>
                  {searchError && (
                    <ErrorMessage
                      message={searchError}
                      retry={() => setSearchRetry((n) => n + 1)}
                    />
                  )}
                  <div aria-live="polite">
                    {result && (
                      <ResultCard
                        key={query}
                        result={result}
                        rules={rules}
                        autoSave={{ source: "text", delayMs: 1500 }}
                      />
                    )}
                  </div>
                </div>
                <section className="hero">
                  <div className="hero-top">
                    <span className="pill">
                      <span className="pulse-dot" /> SEE IT. SCAN IT. SORT IT.
                    </span>
                    <span className="hero-counter">LIVE CAMERA</span>
                  </div>
                  <div className="hero-copy">
                    <h2>
                      Less guessing.
                      <br />
                      More <span>good.</span>
                      <span className="hero-spark">✳</span>
                    </h2>
                    <p>
                      Your everyday waste has a right place.
                      <br />
                      Find it with a little help from AI.
                    </p>
                    <button
                      className="button dark"
                      onClick={() => setModal("camera")}
                    >
                      <ScanLine size={19} /> Start scanning{" "}
                      <ArrowUpRight size={18} />
                    </button>
                    <span className="hero-footnote">
                      A small scan. A smarter sort.
                    </span>
                  </div>
                  <div className="hero-art" aria-hidden="true">
                    <span className="art-orbit orbit-one" />
                    <span className="art-orbit orbit-two" />
                    <div className="art-chip chip-leaf">
                      <Leaf size={29} />
                    </div>
                    <div className="art-chip chip-check">
                      <Check size={22} />
                    </div>
                    <span className="floating-star star-one">✧</span>
                    <span className="floating-star star-two">✳</span>
                    <div className="hero-bin-back">
                      <BinArt color="#f4f6ef" />
                    </div>
                    <div className="hero-bin-front">
                      <BinArt color="#262e29" />
                    </div>
                    <span className="art-label">
                      <Recycle size={14} /> Everything in its place.
                    </span>
                  </div>
                </section>
                <div className="action-grid">
                  <button
                    className="action-card photo-card"
                    onClick={() => setModal("photo")}
                  >
                    <div className="action-card-top">
                      <span className="round-icon dark-icon">
                        <ImagePlus size={23} />
                      </span>
                      <ArrowUpRight size={26} />
                    </div>
                    <div>
                      <span className="eyebrow">GOT A PHOTO?</span>
                      <h3>Upload. Uncover.</h3>
                      <p>One item or a whole mixed pile.</p>
                    </div>
                    <span className="card-doodle">
                      <ImagePlus size={76} strokeWidth={1} />
                    </span>
                  </button>
                  <button
                    className="action-card guide-card"
                    onClick={() => navigate("guide")}
                  >
                    <div className="action-card-top">
                      <span className="round-icon dark-icon">
                        <BookOpen size={23} />
                      </span>
                      <ArrowUpRight size={26} />
                    </div>
                    <div>
                      <span className="eyebrow">A LITTLE KNOW-HOW</span>
                      <h3>Meet your bins.</h3>
                      <p>Good sorting starts right here.</p>
                    </div>
                    <span className="card-doodle">
                      <Recycle size={80} strokeWidth={1} />
                    </span>
                  </button>
                </div>
              </section>
              <aside className="assistant-panel">
                <div className="section-title">
                  <h2>Your sorting sidekick</h2>
                  <Sparkles size={21} />
                </div>
                <div className="assistant-visual">
                  <span className="assistant-tag">
                    <span /> WASTEWISE AI
                  </span>
                  <Orb />
                  <span className="assistant-greeting">
                    A little clarity for your everyday.
                  </span>
                  <span className="assistant-star s1">✧</span>
                  <span className="assistant-star s2">✦</span>
                </div>
                <h3>“Where does this go?”</h3>
                <p className="muted">
                  Describe your item. Add the messy details.
                  <br />
                  We’ll help you make the right call.
                </p>
                <form
                  className="assistant-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    ask();
                  }}
                >
                  <label htmlFor="assistant-input" className="sr-only">
                    Ask the sorting assistant
                  </label>
                  <textarea
                    id="assistant-input"
                    maxLength={1000}
                    rows={3}
                    placeholder="e.g. A takeaway cup with a plastic lid…"
                    value={assistant}
                    onChange={(e) => setAssistant(e.target.value)}
                  />
                  <div>
                    <span>Details make a difference.</span>
                    <button
                      aria-label="Send to AI assistant"
                      disabled={!assistant.trim() || assistantBusy}
                    >
                      {assistantBusy ? (
                        <LoaderCircle size={19} className="spin" />
                      ) : (
                        <ArrowUpRight size={22} />
                      )}
                    </button>
                  </div>
                </form>
                <div className="assistant-prompts">
                  {["Greasy pizza box", "Old phone charger"].map((s) => (
                    <button
                      key={s}
                      onClick={() => ask(s)}
                      disabled={assistantBusy}
                    >
                      {s}
                      <Plus size={12} />
                    </button>
                  ))}
                </div>
                {assistantError && (
                  <ErrorMessage message={assistantError} retry={() => ask()} />
                )}
                <div aria-live="polite">
                  <AnalysisResults
                    analysis={assistantResult}
                    rules={rules}
                    source="text"
                    scanId={assistantScanId}
                  />
                </div>
                <div className="assistant-footer">
                  <ShieldCheck size={16} />
                  <span>Grounded in campus disposal rules</span>
                </div>
                <div className="little-note">
                  <Leaf size={23} />
                  <div>
                    <strong>Progress, one item at a time.</strong>
                    <p>
                      No perfect planet-saving required.
                      <br />
                      Just your next thoughtful choice.
                    </p>
                  </div>
                </div>
              </aside>
            </div>
            <section className="bins-section">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">
                    FIVE PLACES. ONE CLEANER CAMPUS.
                  </span>
                  <h2>A home for every kind of waste.</h2>
                </div>
                <button className="text-link" onClick={() => navigate("guide")}>
                  Explore the guide <ArrowUpRight size={17} />
                </button>
              </div>
              <div className="bins-grid">
                {BINS.map((bin, i) => (
                  <button
                    key={bin.id}
                    className="bin-card"
                    style={
                      {
                        "--pale": bin.pale,
                        "--bin": bin.color,
                      } as CSSProperties
                    }
                    onClick={() => {
                      setFilter(bin.id);
                      navigate("guide");
                    }}
                  >
                    <div className="bin-card-head">
                      <span>0{i + 1}</span>
                      <ArrowUpRight size={19} />
                    </div>
                    <div className="mini-bin">
                      <BinArt
                        color={bin.id === "general" ? "#343b36" : bin.color}
                        small
                      />
                    </div>
                    <h3>
                      <i />
                      {bin.title}
                    </h3>
                    <p>{bin.destination}</p>
                  </button>
                ))}
              </div>
            </section>
            <section className="recent-section">
              <div className="section-heading">
                <h2>A little sorting inspiration</h2>
                <span className="muted">Everyday items, real answers.</span>
              </div>
              <div className="inspiration-grid">
                {[
                  {
                    text: "Plastic bottle",
                    sub: "Empty, rinse, and let it dry.",
                    icon: <Recycle />,
                    color: "#e6edff",
                  },
                  {
                    text: "Banana peel",
                    sub: "Keep the stickers out.",
                    icon: <Leaf />,
                    color: "#edf7cf",
                  },
                  {
                    text: "Battery",
                    sub: "A special item needs a special place.",
                    icon: <Battery />,
                    color: "#ffe6df",
                  },
                ].map((item) => (
                  <button
                    key={item.text}
                    className="inspiration"
                    onClick={() => choose(item.text)}
                  >
                    <span style={{ background: item.color }}>{item.icon}</span>
                    <div>
                      <h3>{item.text}</h3>
                      <p>{item.sub}</p>
                    </div>
                    <ArrowUpRight size={20} />
                  </button>
                ))}
              </div>
            </section>
          </>
        )}
        {view === "guide" && (
          <section className="guide-page">
            <div className="guide-banner">
              <BookOpen size={40} />
              <div>
                <h2>Know the bin. Make the difference.</h2>
                <p>
                  {rules.length
                    ? `${rules.length} rules returned by ${campus}.`
                    : "Loading the campus rules…"}{" "}
                  These apply to this campus scheme; local collection policies
                  can differ.
                </p>
              </div>
            </div>
            <div className="filter-row" aria-label="Waste category filters">
              {[{ id: "all", short: "All items" }, ...BINS].map((bin) => (
                <button
                  key={bin.id}
                  className={filter === bin.id ? "active" : ""}
                  onClick={() => {
                    setFilter(bin.id);
                    setVisibleCount(12);
                  }}
                >
                  {"color" in bin && <i style={{ background: bin.color }} />}
                  {bin.short}
                </button>
              ))}
            </div>
            <div className="rules-grid">
              {rules
                .filter(
                  (r) => filter === "all" || binForRule(r.id)?.id === filter,
                )
                .map((rule) => (
                  <article
                    className="rule-card"
                    key={rule.id}
                    style={
                      {
                        "--bin": binForRule(rule.id)?.color || "#94a3b8",
                      } as CSSProperties
                    }
                  >
                    <div>
                      <span className="rule-number">{rule.id}</span>
                      <span className="bin-label">
                        <i />
                        {binForRule(rule.id)?.destination || rule.category}
                      </span>
                    </div>
                    <h3>{rule.title}</h3>
                    <p>{rule.text}</p>
                  </article>
                ))}
            </div>
            <div className="section-heading catalog-heading">
              <div>
                <span className="eyebrow">THE EVERYDAY WASTE LIBRARY</span>
                <h2>
                  Find your item.
                  {catalogTotal !== null && (
                    <small> {catalogTotal} supported items</small>
                  )}
                </h2>
              </div>
              <div className="search-box catalog-search">
                <Search size={19} />
                <input
                  aria-label="Search waste catalog"
                  placeholder="Search the catalog…"
                  value={catalogQuery}
                  maxLength={250}
                  onChange={(e) => setCatalogQuery(e.target.value)}
                />
              </div>
            </div>
            {catalogError && (
              <ErrorMessage
                message={catalogError}
                retry={() => setCatalogRetry((n) => n + 1)}
              />
            )}
            <div aria-live="polite">
              {catalogBusy ? (
                <div className="empty-state">
                  <LoaderCircle className="spin" />
                  Loading catalog…
                </div>
              ) : filtered.length === 0 ? (
                <div className="empty-state">
                  <Search />
                  No items match this search and category.
                </div>
              ) : (
                <div className="catalog-grid">
                  {filtered.slice(0, visibleCount).map((item) => (
                    <button
                      className="catalog-item"
                      key={item.name}
                      onClick={() => choose(item.name)}
                    >
                      <span
                        style={{ background: binForRule(item.ruleId)?.pale }}
                      >
                        <Recycle
                          size={20}
                          color={binForRule(item.ruleId)?.color}
                        />
                      </span>
                      <div>
                        <strong>{item.name}</strong>
                        <p>{item.material}</p>
                        <small>
                          {item.ruleId} ·{" "}
                          {/pizza box/i.test(item.name)
                            ? "Check condition"
                            : binForRule(item.ruleId)?.destination ||
                              "Check guide"}
                        </small>
                      </div>
                      <ChevronRight size={17} />
                    </button>
                  ))}
                </div>
              )}
            </div>
            {visibleCount < filtered.length && (
              <button
                className="button light load-more"
                onClick={() => setVisibleCount((n) => n + 24)}
              >
                Show more items <Plus size={17} />
              </button>
            )}
          </section>
        )}
        {view === "rewards" && (
          <RequireSignIn reason="Sign in to see your points, start a smart-bin disposal and track your rewards.">
            <RewardsView
              key={signedInUid || "signed-out"}
              account={rewardAccount}
              accountError={rewardError}
              refreshAccount={loadRewards}
            />
          </RequireSignIn>
        )}
        {view === "history" && (
          <AccountHistoryView
            onFindFirst={() => {
              navigate("home");
              requestAnimationFrame(() => searchRef.current?.focus());
            }}
          />
        )}
        <footer className="page-footer">
          <span>
            <Recycle size={17} /> A wiser way to waste.
          </span>
          <span>
            Made for small, everyday change. <Leaf size={14} />
          </span>
        </footer>
      </main>
      <nav
        className={`bottom-nav ${navHidden ? "nav-hidden" : ""}`}
        aria-label="Main navigation"
      >
        <button
          className={view === "home" ? "active" : ""}
          onClick={() => navigate("home")}
          aria-current={view === "home" ? "page" : undefined}
        >
          <Home size={21} />
          <span>Home</span>
          <i />
        </button>
        <button
          className={modal === "photo" ? "active" : ""}
          onClick={() => setModal("photo")}
        >
          <ImagePlus size={21} />
          <span>Photo</span>
          <i />
        </button>
        <button
          className="nav-upload"
          onClick={() => setModal("camera")}
          aria-label="Scan with the live camera"
        >
          <ScanLine size={25} />
        </button>
        <button
          className={view === "rewards" ? "active" : ""}
          onClick={() => navigate("rewards")}
          aria-current={view === "rewards" ? "page" : undefined}
        >
          <Gift size={21} />
          <span>Rewards</span>
          <i />
        </button>
        <button
          className={view === "history" ? "active" : ""}
          onClick={() => navigate("history")}
          aria-current={view === "history" ? "page" : undefined}
        >
          <Clock3 size={21} />
          <span>History</span>
          <i />
        </button>
      </nav>
      {modal && (
        <ModalShell
          title={
            modal === "photo"
              ? "A fresh perspective."
              : modal === "camera"
                ? "See it. Sort it."
                : modal === "dlc"
                  ? "Bin station."
                : "Small steps, thoughtfully sorted."
          }
          close={() => setModal(null)}
        >
          {modal === "photo" ? (
            <PhotoPanel rules={rules} />
          ) : modal === "camera" ? (
            <CameraPanel rules={rules} />
          ) : modal === "dlc" ? (
            <DlcStation />
          ) : (
            <div className="about-content">
              <Orb small />
              <p>
                WasteWise connects to your provided backend to classify everyday
                waste using campus disposal rules.
              </p>
              <ul>
                <li>Search uses the backend’s instant classifier.</li>
                <li>
                  Photos, camera frames, and assistant questions use its AI
                  analysis service.
                </li>
                <li>Bin colors follow the provided five-category scheme.</li>
                <li>
                  History is stored only in this browser and can be cleared
                  anytime.
                </li>
              </ul>
              <p>
                Unknown items and backend errors are shown explicitly. AI
                results may be uncertain; always check the supporting rule.
              </p>
              <span className="bin-label">
                <i
                  style={{
                    background: status === "online" ? "#22c55e" : "#eab308",
                  }}
                />
                {status === "online"
                  ? "Backend is reachable"
                  : "Backend is not connected"}
              </span>
              <p className="muted">
                The configured provider flag does not guarantee available AI
                credits.
              </p>
            </div>
          )}
        </ModalShell>
      )}
    </div>
  );
}
