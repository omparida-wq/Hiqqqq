import test from "node:test";
import assert from "node:assert/strict";
import { proxyRequest } from "../lib/wastewise-proxy.ts";
import { resetFirebaseKeyCache } from "../lib/firebase-auth-server.ts";
import { resetMemberAccountsForTests } from "../lib/member-accounts.ts";

const PROJECT = "wastewise-test";
const { publicKey, privateKey } = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const jwk = { ...(await crypto.subtle.exportKey("jwk", publicKey)), kid: "k1", alg: "RS256" };
const b64 = (x) => Buffer.from(JSON.stringify(x)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const body = `${b64({ alg: "RS256", kid: "k1" })}.${b64({ aud: PROJECT, iss: `https://securetoken.google.com/${PROJECT}`, sub: "user-1", iat: now, auth_time: now, exp: now + 3600 })}`;
const idToken = `${body}.${Buffer.from(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(body))).toString("base64url")}`;
// D1 stand-in that already maps user-1 to their own member token.
const db = { prepare: (sql) => { const s = { bind: () => s, run: async () => ({}), first: async () => (/^SELECT/.test(sql) ? { member_id: "m1", member_token: "member-token-1" } : null) }; return s; } };

function backend(log) {
  return async (url, init = {}) => {
    if (String(url).includes("googleapis.com")) return new Response(JSON.stringify({ keys: [jwk] }), { headers: { "content-type": "application/json", "cache-control": "max-age=600" } });
    log.push({ url: String(url), method: init.method, auth: init.headers.get("authorization"), body: init.body });
    const path = new URL(url).pathname;
    if (path === "/api/rewards/me") return Response.json({ points: 42 });
    if (path === "/api/dlc/sessions") return Response.json({ id: "sess-1", status: "pending" });
    if (path === "/api/dlc/sessions/missing") return Response.json({ error: "Session not found" }, { status: 404 });
    return Response.json({ ok: true });
  };
}
const env = { WASTEWISE_API_BASE_URL: "https://backend.example", WASTEWISE_FIREBASE_PROJECT_ID: PROJECT, WASTEWISE_REWARDS_ADMIN_KEY: "ADMIN", DB: db };
const req = (path, method = "GET", b) => new Request(`http://app/api/wastewise/${path}`, { method, headers: { authorization: `Bearer ${idToken}` }, ...(b ? { body: JSON.stringify(b) } : {}) });
test.beforeEach(() => { resetFirebaseKeyCache(); resetMemberAccountsForTests(); });

test("reward endpoints are forwarded with the signed-in user's own member token", async () => {
  const log = [];
  const me = await proxyRequest(req("rewards/me"), "rewards/me", env, backend(log));
  assert.equal((await me.json()).points, 42);
  assert.equal(log[0].url, "https://backend.example/api/rewards/me");
  assert.equal(log[0].auth, "Bearer member-token-1");
  for (const p of ["rewards/transactions", "dlc/bins", "dlc/sessions/abc-123"]) assert.equal((await proxyRequest(req(p), p, env, backend(log))).status, 200, p);
});
test("starting a disposal posts the selected bin", async () => {
  const log = [];
  const r = await proxyRequest(req("dlc/sessions", "POST", { binId: "5de67379-6a6c-44e7-adec-e9a69805603b" }), "dlc/sessions", env, backend(log));
  assert.equal((await r.json()).id, "sess-1");
  assert.equal(log[0].method, "POST");
  assert.deepEqual(JSON.parse(log[0].body), { binId: "5de67379-6a6c-44e7-adec-e9a69805603b" });
  assert.equal((await proxyRequest(req("dlc/sessions", "POST", {}), "dlc/sessions", env, backend([]))).status, 400);
});
test("unknown paths, wrong methods and path tricks are refused", async () => {
  for (const [p, m] of [["rewards/admin", "GET"], ["rewards/accounts", "POST"], ["dlc/sessions/../../admin", "GET"], ["dlc/sessions/a/b", "GET"], ["rewards/me", "POST"], ["dlc/bins", "POST"], ["history", "DELETE"], ["constructor", "GET"]]) {
    const r = await proxyRequest(req("x", m, m === "POST" ? {} : undefined), p, env, backend([]));
    assert.ok([404, 405].includes(r.status), `${m} ${p} -> ${r.status}`);
  }
});
test("missing sessions and rejected member tokens give clear messages", async () => {
  const gone = await proxyRequest(req("dlc/sessions/missing"), "dlc/sessions/missing", env, backend([]));
  assert.equal(gone.status, 404);
  const rejected = await proxyRequest(req("rewards/me"), "rewards/me", env, async (url) => String(url).includes("googleapis") ? new Response(JSON.stringify({ keys: [jwk] }), { headers: { "content-type": "application/json" } }) : Response.json({ error: "Account token required" }, { status: 401 }));
  assert.equal(rejected.status, 401);
  assert.equal((await rejected.json()).code, "MEMBER_TOKEN_REJECTED");
});
