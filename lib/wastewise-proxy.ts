import { bearerToken, verifyFirebaseIdToken } from "./firebase-auth-server.ts";
import { MemberAccountError, memberTokenFor, type D1Like } from "./member-accounts.ts";
import { MAX_HISTORY_BODY, validateHistoryBody } from "./history-validate.ts";

export type BackendEnv = {
  /** Firebase project used to verify signed-in users (required for history, rewards and bin sessions). */
  WASTEWISE_FIREBASE_PROJECT_ID?: string;
  /** Admin credential used only here, server-side, to create one backend member per user. Never sent to browsers. */
  WASTEWISE_REWARDS_ADMIN_KEY?: string;
  /** Cloudflare D1 database storing Firebase user -> backend member token. */
  DB?: D1Like;
  WASTEWISE_API_BASE_URL?: string;
  WASTEWISE_API_KEY?: string;
  WASTEWISE_API_KEY_HEADER?: string;
  WASTEWISE_API_KEY_PREFIX?: string;
};
const endpoints: Record<string, string> = {
  config: "GET",
  rules: "GET",
  catalog: "GET",
  classify: "POST",
  analyze: "POST",
  "rewards/me": "GET",
  "rewards/transactions": "GET",
  "dlc/bins": "GET",
  "dlc/sessions": "POST",
  history: "GET|POST",
};
/** Endpoints that act on the signed-in user's own backend member account. */
export const isMemberEndpoint = (endpoint: string) =>
  endpoint === "history" || (/^(rewards|dlc)\//.test(endpoint) && endpoint !== "dlc/bins");
// GET dlc/sessions/<SESSION_ID>
const SESSION_PATH = /^dlc\/sessions\/[A-Za-z0-9_-]{1,100}$/;
function allowedMethod(endpoint: string) {
  if (SESSION_PATH.test(endpoint)) return "GET";
  return Object.hasOwn(endpoints, endpoint) ? endpoints[endpoint] : undefined;
}
export async function proxyRequest(
  request: Request,
  endpoint: string,
  env: BackendEnv,
  fetcher: typeof fetch = fetch,
) {
  const json = (body: unknown, status: number) =>
    Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  const method = allowedMethod(endpoint);
  if (!method) return json({ error: "Unknown endpoint." }, 404);
  if (!method.split("|").includes(request.method))
    return json({ error: "Method not allowed." }, 405);
  const base = env.WASTEWISE_API_BASE_URL || "https://harness-action-entail.ngrok-free.dev";
  const headers = new Headers({
    "Content-Type": "application/json",
    "ngrok-skip-browser-warning": "true",
    "x-api-client": "wastewise",
  });
  // Sign-in is optional for sorting. History, rewards and bin sessions belong to one user: the
  // verified Firebase user is mapped to their own backend member token (never a shared token,
  // never a browser-supplied user ID).
  if (isMemberEndpoint(endpoint)) {
    if (!env.WASTEWISE_FIREBASE_PROJECT_ID)
      return json({ error: "Sign-in is not configured on this server.", code: "AUTH_NOT_CONFIGURED" }, 503);
    const token = bearerToken(request);
    let user = null;
    try {
      user = token ? await verifyFirebaseIdToken(token, env.WASTEWISE_FIREBASE_PROJECT_ID, { fetcher }) : null;
    } catch {
      return json({ error: "Sign-in could not be checked right now. Please try again." }, 503);
    }
    if (!user) return json({ error: "Please sign in to continue.", code: "AUTH_REQUIRED" }, 401);
    try {
      const memberToken = await memberTokenFor({
        db: env.DB,
        uid: user.uid,
        name: user.name || user.email || "WasteWise user",
        adminKey: env.WASTEWISE_REWARDS_ADMIN_KEY,
        baseUrl: base,
        fetcher,
      });
      headers.set("Authorization", `Bearer ${memberToken}`);
    } catch (e) {
      if (e instanceof MemberAccountError) return json({ error: e.message, code: e.code }, e.status);
      return json({ error: "Your account could not be connected right now. Please try again.", code: "MEMBER_ACCOUNT_ERROR" }, 503);
    }
  }
  if (env.WASTEWISE_API_KEY) {
    if (!env.WASTEWISE_API_KEY_HEADER)
      return json(
        {
          error:
            "Set WASTEWISE_API_KEY_HEADER in the server environment to match your backend authentication contract.",
        },
        503,
      );
    try {
      headers.set(
        env.WASTEWISE_API_KEY_HEADER,
        `${env.WASTEWISE_API_KEY_PREFIX || ""}${env.WASTEWISE_API_KEY}`,
      );
    } catch {
      return json(
        { error: "Invalid backend authentication header configuration." },
        503,
      );
    }
  }
  let body: string | undefined;
  if (request.method === "POST" && endpoint === "history") {
    if (Number(request.headers.get("content-length")) > MAX_HISTORY_BODY)
      return json({ error: "History request is too large (16 KB maximum).", code: "HISTORY_TOO_LARGE" }, 413);
    const text = await request.text();
    if (new TextEncoder().encode(text).length > MAX_HISTORY_BODY)
      return json({ error: "History request is too large (16 KB maximum).", code: "HISTORY_TOO_LARGE" }, 413);
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { return json({ error: "History must be JSON.", code: "HISTORY_INVALID" }, 400); }
    const checked = validateHistoryBody(parsed);
    if ("error" in checked) return json({ error: checked.error, code: "HISTORY_INVALID" }, 400);
    body = JSON.stringify(checked.body);
  } else if (request.method === "POST") {
    if (Number(request.headers.get("content-length")) > 12_000_000)
      return json(
        { error: "Image is too large. Please use an image under 8 MB." },
        413,
      );
    body = await request.text();
    if (body.length > 12_000_000)
      return json(
        { error: "Image is too large. Please use an image under 8 MB." },
        413,
      );
    try {
      const data = JSON.parse(body);
      if (!data || typeof data !== "object" || Array.isArray(data))
        throw new Error();
      if (
        endpoint === "classify" &&
        (typeof data.text !== "string" ||
          !data.text.trim() ||
          data.text.length > 1000)
      )
        throw new Error();
      if (
        endpoint === "dlc/sessions" &&
        (typeof data.binId !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(data.binId))
      )
        throw new Error();
      if (
        endpoint === "analyze" &&
        !(typeof data.description === "string" && data.description.trim()) &&
        !(
          data.photo &&
          typeof data.photo.data === "string" &&
          /^data:image\/(jpeg|png|webp);base64,/.test(data.photo.data)
        )
      )
        throw new Error();
    } catch {
      return json(
        {
          error:
            endpoint === "dlc/sessions"
              ? "Choose a bin first."
              : "Enter an item description or choose a supported image.",
        },
        400,
      );
    }
  }
  try {
    const url = new URL(`/api/${endpoint}`, base);
    const incoming = new URL(request.url);
    if (endpoint === "history" && request.method === "GET") {
      const limit = Number(incoming.searchParams.get("limit") || 50);
      url.searchParams.set("limit", String(Number.isInteger(limit) ? Math.min(100, Math.max(1, limit)) : 50));
      const cursor = incoming.searchParams.get("cursor");
      if (cursor) url.searchParams.set("cursor", cursor.slice(0, 500));
    }
    if (endpoint === "catalog")
      for (const key of ["q", "family"]) {
        const val = incoming.searchParams.get(key);
        if (val) url.searchParams.set(key, val.slice(0, 250));
      }
    const res = await fetcher(url, {
      method: request.method,
      headers,
      body,
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(45_000)]),
      redirect: "manual",
    });
    if (!res.headers.get("content-type")?.includes("application/json"))
      return json(
        {
          error:
            "The backend returned an unexpected response. Check that the backend tunnel is online.",
        },
        502,
      );
    const data = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      const providerMessage = typeof data.error === "string" ? data.error : "";
      if (/402|tokens used|subscription|quota/i.test(providerMessage))
        return json(
          {
            error:
              "AI analysis is unavailable: the backend provider reports its token allowance is exhausted. Text sorting and the bin guide still work.",
            code: "AI_QUOTA_EXHAUSTED",
          },
          502,
        );
      if (res.status === 401 && isMemberEndpoint(endpoint))
        return json(
          { error: "The backend rejected your account connection. Ask the backend owner to check your member account.", code: "MEMBER_TOKEN_REJECTED" },
          401,
        );
      if (res.status === 404 && endpoint.startsWith("dlc/sessions/"))
        return json({ error: "This disposal session was not found or has ended.", code: "SESSION_NOT_FOUND" }, 404);
      return json(
        {
          error: typeof data.error === "string" && isMemberEndpoint(endpoint)
            ? data.error
            : `The backend could not complete this request (HTTP ${res.status}). Please try again.`,
          code: "BACKEND_ERROR",
        },
        res.status,
      );
    }
    return json(data, 200);
  } catch (e) {
    return json(
      {
        error:
          e instanceof Error && /timeout/i.test(e.name)
            ? "The backend took too long to respond. Please try again."
            : "Cannot reach the WasteWise backend. Check your connection and backend URL, then retry.",
      },
      502,
    );
  }
}
