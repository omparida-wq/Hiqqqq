// Trusted-server mapping: Firebase user ID -> backend member account/token.
// A backend member is provisioned once (POST /api/rewards/accounts with the admin key) and the
// returned member token is stored in D1 and reused on every later login. Tokens never reach the
// browser and are never logged.

type Stmt = { bind(...values: unknown[]): Stmt; first<T = Record<string, unknown>>(): Promise<T | null>; run(): Promise<unknown> };
export type D1Like = { prepare(sql: string): Stmt };

export class MemberAccountError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(message: string, status: number, code: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const CREATE_TABLE = `CREATE TABLE IF NOT EXISTS member_accounts (
  firebase_uid TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  member_token TEXT NOT NULL,
  name TEXT,
  created_at INTEGER NOT NULL
)`;
let tableReady: Promise<unknown> | null = null;
const inFlight = new Map<string, Promise<string>>(); // one provisioning per user at a time (per instance)

async function ensureTable(db: D1Like) {
  tableReady ??= db.prepare(CREATE_TABLE).run().catch((e) => { tableReady = null; throw e; });
  await tableReady;
}

export async function memberTokenFor(options: {
  db: D1Like | undefined;
  uid: string;
  name: string;
  adminKey: string | undefined;
  baseUrl: string;
  fetcher?: typeof fetch;
}): Promise<string> {
  const { db, uid, name, adminKey, baseUrl, fetcher = fetch } = options;
  if (!db)
    throw new MemberAccountError(
      "Account storage is not configured on the server (Cloudflare D1 binding DB).",
      503,
      "MEMBER_STORE_UNAVAILABLE",
    );
  await ensureTable(db);
  const existing = await db.prepare("SELECT member_token FROM member_accounts WHERE firebase_uid = ?").bind(uid).first<{ member_token: string }>();
  if (existing?.member_token) return existing.member_token;
  const pending = inFlight.get(uid);
  if (pending) return pending;
  const work = (async () => {
    if (!adminKey)
      throw new MemberAccountError(
        "Your rewards account can't be created yet: the server is missing WASTEWISE_REWARDS_ADMIN_KEY.",
        503,
        "MEMBER_PROVISIONING_NOT_CONFIGURED",
      );
    let res: Response;
    try {
      res = await fetcher(new URL("/api/rewards/accounts", baseUrl), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
          "x-api-client": "wastewise",
          Authorization: `Bearer ${adminKey}`,
        },
        body: JSON.stringify({ name: name.slice(0, 120) || "WasteWise user" }),
        signal: AbortSignal.timeout(20_000),
        redirect: "manual",
      });
    } catch {
      throw new MemberAccountError("Cannot reach the WasteWise backend to set up your account.", 502, "MEMBER_PROVISIONING_FAILED");
    }
    const data = (await res.json().catch(() => null)) as { user?: { id?: unknown }; token?: unknown } | null;
    if (!res.ok || typeof data?.token !== "string" || !data.token || typeof data.user?.id !== "string")
      throw new MemberAccountError(
        res.status === 401 || res.status === 403
          ? "The backend rejected the server's rewards admin key."
          : "The backend could not create your rewards account.",
        502,
        "MEMBER_PROVISIONING_FAILED",
      );
    // INSERT OR IGNORE + re-read: if another instance stored a mapping first, everyone uses that one.
    await db
      .prepare("INSERT OR IGNORE INTO member_accounts (firebase_uid, member_id, member_token, name, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(uid, data.user.id, data.token, name.slice(0, 120), Date.now())
      .run();
    const stored = await db.prepare("SELECT member_token FROM member_accounts WHERE firebase_uid = ?").bind(uid).first<{ member_token: string }>();
    if (!stored?.member_token) throw new MemberAccountError("Your account mapping could not be saved.", 503, "MEMBER_STORE_UNAVAILABLE");
    return stored.member_token;
  })().finally(() => inFlight.delete(uid));
  inFlight.set(uid, work);
  return work;
}

/** Only for tests. */
export function resetMemberAccountsForTests() {
  tableReady = null;
  inFlight.clear();
}
